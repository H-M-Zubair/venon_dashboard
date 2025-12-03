import { clickhouseConnection } from '@/database/clickhouse/connection.js';
import logger from '@/config/logger.js';
import { getAttributionTableName } from '@/utils/attribution-tables.js';
import { getShopNameFromAccountId } from '@/utils/account-helpers.js';
import {
  validateDateRange,
  makeEndDateInclusiveAndFormat,
  makeEndDateInclusive,
  shouldUseHourlyAggregation,
} from '@/utils/date-helpers.js';
import type {
  ChannelPerformanceQuery,
  ChannelPerformanceResponse,
  ChannelPerformanceData,
  PixelChannelQuery,
  PixelChannelResponse,
  PixelChannelRawData,
  PixelChannelCampaignData,
  PixelChannelAdSetData,
  PixelChannelAdData,
  CampaignMetadata,
  AdSetMetadata,
  AdMetadata,
  DashboardMetricsQuery,
  DashboardMetricsResponse,
  DashboardMetricsTimeseries,
} from '@/types/analytics.js';

export class AnalyticsService {
  async getChannelPerformance(
    accountId: string,
    params: ChannelPerformanceQuery['query']
  ): Promise<ChannelPerformanceResponse> {
    const startTime = Date.now();

    try {
      // Get shop name from account ID
      const actualShopName = await getShopNameFromAccountId(accountId);
      logger.info('Resolved shop name from account', { accountId, actualShopName });

      // Validate and prepare date range
      const startDate = new Date(params.start_date);
      const endDate = new Date(params.end_date);
      validateDateRange(startDate, endDate);

      // Make end date inclusive for query
      const endDateStr = makeEndDateInclusiveAndFormat(endDate);

      // Get the appropriate table name based on attribution model
      const tableName = getAttributionTableName(params.attribution_model);

      const query = `
        WITH channel_attribution AS (
          SELECT
              channel,
              shopify_shop,
              SUM(attribution_weight) AS total_attributed_orders,
              SUM(attributed_revenue) AS total_attributed_revenue,
              COUNT(DISTINCT order_id) AS distinct_orders_touched,
              SUM(attributed_cogs) AS total_attributed_cogs,
              SUM(attributed_payment_fees) AS total_attributed_payment_fees,
              SUM(attributed_tax) AS total_attributed_tax,
              SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight ELSE 0 END) AS first_time_customer_orders,
              SUM(CASE WHEN is_first_customer_order = 1 THEN attributed_revenue ELSE 0 END) AS first_time_customer_revenue
          FROM ${tableName}
          WHERE shopify_shop = {shop_name:String}
              AND order_timestamp >= {start_date:String}
              AND order_timestamp < {end_date:String}
              AND attribution_window = {attribution_window:String}
          GROUP BY channel, shopify_shop
        ),
        channel_spend AS (
          SELECT
              channel,
              SUM(spend) AS ad_spend
          FROM int_ad_spend
          WHERE shop_name = {shop_name:String}
              AND date_time >= {start_date:String}
              AND date_time < {end_date:String}
          GROUP BY channel
        ),
        shop_vat_settings AS (
          SELECT
              shop_name,
              COALESCE(ignore_vat, false) AS ignore_vat
          FROM stg_shopify_shops
          WHERE shop_name = {shop_name:String}
          LIMIT 1
        )
        SELECT
            COALESCE(ca.channel, cs.channel) AS channel,
            COALESCE(ca.total_attributed_orders, 0) AS attributed_orders,
            COALESCE(ca.total_attributed_revenue, 0) AS attributed_revenue,
            COALESCE(ca.distinct_orders_touched, 0) AS distinct_orders_touched,
            COALESCE(ca.total_attributed_cogs, 0) AS attributed_cogs,
            COALESCE(ca.total_attributed_payment_fees, 0) AS attributed_payment_fees,
            COALESCE(ca.total_attributed_tax, 0) AS attributed_tax,
            COALESCE(cs.ad_spend, 0) AS ad_spend,
            -- Calculate performance metrics
            CASE
                WHEN COALESCE(cs.ad_spend, 0) > 0
                THEN ca.total_attributed_revenue / cs.ad_spend
                ELSE 0
            END AS roas,
            -- Conditional VAT in profit calculation
            COALESCE(ca.total_attributed_revenue, 0) -
            CASE WHEN svs.ignore_vat = true THEN 0 ELSE COALESCE(ca.total_attributed_tax, 0) END -
            COALESCE(ca.total_attributed_cogs, 0) -
            COALESCE(ca.total_attributed_payment_fees, 0) -
            COALESCE(cs.ad_spend, 0) AS net_profit,
            -- First-time customer metrics
            COALESCE(ca.first_time_customer_orders, 0) AS first_time_customer_orders,
            COALESCE(ca.first_time_customer_revenue, 0) AS first_time_customer_revenue,
            CASE
                WHEN COALESCE(cs.ad_spend, 0) > 0
                THEN COALESCE(ca.first_time_customer_revenue, 0) / cs.ad_spend
                ELSE 0
            END AS first_time_customer_roas
        FROM channel_attribution ca
        FULL OUTER JOIN channel_spend cs ON ca.channel = cs.channel
        CROSS JOIN shop_vat_settings svs
        ORDER BY attributed_revenue DESC
      `;

      const queryParams = {
        shop_name: actualShopName, // Use the actual shop name from Supabase
        start_date: params.start_date,
        end_date: endDateStr,
        attribution_window: params.attribution_window,
      };

      logger.info('Executing channel performance query', {
        accountId,
        params: queryParams,
      });

      const results = await clickhouseConnection.query<ChannelPerformanceData>(query, queryParams);

      // Debug: Log raw results to check for duplicates
      logger.info('Raw channel performance results', {
        resultCount: results.length,
        channels: results.map((r) => r.channel),
        firstFewResults: results.slice(0, 3),
      });

      const response: ChannelPerformanceResponse = {
        data: results.map((row) => ({
          channel: row.channel,
          attributed_orders: Number(row.attributed_orders),
          attributed_revenue: Number(row.attributed_revenue),
          distinct_orders_touched: Number(row.distinct_orders_touched),
          attributed_cogs: Number(row.attributed_cogs),
          attributed_payment_fees: Number(row.attributed_payment_fees),
          attributed_tax: Number(row.attributed_tax),
          ad_spend: Number(row.ad_spend),
          roas: Number(row.roas),
          net_profit: Number(row.net_profit),
          first_time_customer_orders: Number(row.first_time_customer_orders),
          first_time_customer_revenue: Number(row.first_time_customer_revenue),
          first_time_customer_roas: Number(row.first_time_customer_roas),
        })),
        metadata: {
          shop_name: actualShopName, // Use the actual shop name from Supabase
          start_date: params.start_date,
          end_date: params.end_date,
          attribution_model: params.attribution_model,
          attribution_window: params.attribution_window,
          total_channels: results.length,
          query_timestamp: new Date().toISOString(),
        },
      };

      const executionTime = Date.now() - startTime;
      logger.info('Channel performance query completed', {
        accountId,
        executionTimeMs: executionTime,
        resultCount: results.length,
      });

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error('Channel performance query failed', {
        accountId,
        params,
        executionTimeMs: executionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async validateShopAccess(accountId: string, shopName: string): Promise<boolean> {
    try {
      // Import here to avoid circular dependency
      const { supabaseConnection } = await import('@/database/supabase/connection.js');
      const supabase = supabaseConnection.getServiceClient();

      logger.info('Validating shop access', { accountId, shopName });

      // First, let's check what columns exist in the table
      const { data: tableInfo, error: tableError } = await supabase
        .from('shopify_shops')
        .select('*')
        .limit(1);

      logger.info('Shopify shops table structure sample:', { tableInfo, tableError });

      // For development, let's be more permissive and just check if any shop exists for this account
      const { data, error } = await supabase
        .from('shopify_shops')
        .select('*')
        .eq('account_id', accountId)
        .limit(1);

      logger.info('Shop access validation result:', { data, error, accountId, shopName });

      if (error) {
        logger.warn('Shop access validation query failed', {
          accountId,
          shopName,
          error: error.message,
        });
        // For development, return true if it's just a column issue
        if (error.message.includes('does not exist')) {
          logger.warn('Column issue detected, allowing access for development');
          return true;
        }
        return false;
      }

      // If we found any shop for this account, allow access (for development)
      return data && data.length > 0;
    } catch (error) {
      logger.error('Shop access validation failed', {
        accountId,
        shopName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // For development, allow access on errors
      return true;
    }
  }

  private generateAdManagerUrl(
    platform: string,
    entityType: 'campaign' | 'ad_set' | 'ad',
    platformId: string,
    adAccountId?: string
  ): string | undefined {
    // Remove 'act_' prefix from Facebook ad account IDs if present
    const cleanAdAccountId = adAccountId?.replace('act_', '');

    switch (platform) {
      case 'meta-ads':
        if (!cleanAdAccountId) return undefined;

        switch (entityType) {
          case 'campaign':
            return `https://www.facebook.com/adsmanager/manage/campaigns?act=${cleanAdAccountId}&filter_set=SEARCH_BY_CAMPAIGN_GROUP_ID-STRING%1EEQUAL%1E%22${platformId}%22&selected_campaign_ids=${platformId}`;
          case 'ad_set':
            return `https://www.facebook.com/adsmanager/manage/adsets?act=${cleanAdAccountId}&filter_set=SEARCH_BY_CAMPAIGN_ID-STRING%1EEQUAL%1E%22${platformId}%22&selected_adset_ids=${platformId}`;
          case 'ad':
            return `https://www.facebook.com/adsmanager/manage/ads?act=${cleanAdAccountId}&filter_set=SEARCH_BY_ADGROUP_IDS-STRING_SET%1EANY%1E%5B%22${platformId}%22%5D&selected_ad_ids=${platformId}`;
          default:
            return undefined;
        }

      case 'google-ads':
        // Google Ads only supports campaign-level URLs
        if (entityType === 'campaign' && platformId) {
          return `https://ads.google.com/aw/campaigns?campaignId=${platformId}`;
        }
        break;

      case 'taboola':
        // Taboola only supports campaign-level URLs
        if (entityType === 'campaign' && platformId) {
          return `https://ads.taboola.com/campaigns?campaignId=${platformId}`;
        }
        break;
    }

    return undefined;
  }

  async getPixelChannelPerformance(
    accountId: string,
    params: PixelChannelQuery['query']
  ): Promise<PixelChannelResponse> {
    const startTime = Date.now();

    try {
      // Get shop name from account ID
      const actualShopName = await getShopNameFromAccountId(accountId);
      logger.info('Resolved shop name from account for pixel channel', {
        accountId,
        actualShopName,
        channel: params.channel,
      });

      // Validate and prepare date range
      const startDate = new Date(params.start_date);
      const endDate = new Date(params.end_date);
      validateDateRange(startDate, endDate);

      // Make end date inclusive for query
      const endDateStr = makeEndDateInclusiveAndFormat(endDate);

      // Get the appropriate table name based on attribution model
      const tableName = getAttributionTableName(params.attribution_model);

      // Execute the ClickHouse query
      const query = `
        WITH ad_attribution AS (
          SELECT
              channel,
              shopify_shop,
              platform_ad_campaign_id,
              platform_ad_set_id,
              platform_ad_id,
              ad_campaign_pk,
              ad_set_pk,
              ad_pk,
              SUM(attribution_weight) AS total_attributed_orders,
              SUM(attributed_revenue) AS total_attributed_revenue,
              COUNT(DISTINCT order_id) AS distinct_orders_touched,
              SUM(attributed_cogs) AS total_attributed_cogs,
              SUM(attributed_payment_fees) AS total_attributed_payment_fees,
              SUM(attributed_tax) AS total_attributed_tax,
              SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight ELSE 0 END) AS first_time_customer_orders,
              SUM(CASE WHEN is_first_customer_order = 1 THEN attributed_revenue ELSE 0 END) AS first_time_customer_revenue
          FROM ${tableName}
          WHERE shopify_shop = {shop_name:String}
              AND order_timestamp >= {start_date:String}
              AND order_timestamp < {end_date:String}
              AND attribution_window = {attribution_window:String}
              AND channel = {channel:String}
              AND platform_ad_id IS NOT NULL
          GROUP BY
              channel,
              shopify_shop,
              platform_ad_campaign_id,
              platform_ad_set_id,
              platform_ad_id,
              ad_campaign_pk,
              ad_set_pk,
              ad_pk
        ),
        ad_spend AS (
          SELECT
              channel,
              platform_ad_campaign_id,
              platform_ad_set_id,
              platform_ad_id,
              ad_campaign_pk,
              ad_set_pk,
              ad_pk,
              SUM(spend) AS ad_spend,
              SUM(impressions) AS impressions,
              SUM(clicks) AS clicks,
              SUM(conversions) AS conversions
          FROM int_ad_spend
          WHERE shop_name = {shop_name:String}
              AND date_time >= {start_date:String}
              AND date_time < {end_date:String}
              AND channel = {channel:String}
              AND platform_ad_id IS NOT NULL
          GROUP BY
              channel,
              platform_ad_campaign_id,
              platform_ad_set_id,
              platform_ad_id,
              ad_campaign_pk,
              ad_set_pk,
              ad_pk
        ),
        shop_vat_settings AS (
          SELECT
              shop_name,
              COALESCE(ignore_vat, false) AS ignore_vat
          FROM stg_shopify_shops
          WHERE shop_name = {shop_name:String}
          LIMIT 1
        )
        SELECT
            COALESCE(aa.channel, ads.channel) AS channel,
            COALESCE(aa.platform_ad_campaign_id, ads.platform_ad_campaign_id) AS platform_ad_campaign_id,
            COALESCE(aa.platform_ad_set_id, ads.platform_ad_set_id) AS platform_ad_set_id,
            COALESCE(aa.platform_ad_id, ads.platform_ad_id) AS platform_ad_id,
            COALESCE(aa.ad_campaign_pk, ads.ad_campaign_pk) AS ad_campaign_pk,
            COALESCE(aa.ad_set_pk, ads.ad_set_pk) AS ad_set_pk,
            COALESCE(aa.ad_pk, ads.ad_pk) AS ad_pk,
            COALESCE(aa.total_attributed_orders, 0) AS attributed_orders,
            COALESCE(aa.total_attributed_revenue, 0) AS attributed_revenue,
            COALESCE(aa.distinct_orders_touched, 0) AS distinct_orders_touched,
            COALESCE(aa.total_attributed_cogs, 0) AS attributed_cogs,
            COALESCE(aa.total_attributed_payment_fees, 0) AS attributed_payment_fees,
            COALESCE(aa.total_attributed_tax, 0) AS attributed_tax,
            COALESCE(ads.ad_spend, 0) AS ad_spend,
            COALESCE(ads.impressions, 0) AS impressions,
            COALESCE(ads.clicks, 0) AS clicks,
            COALESCE(ads.conversions, 0) AS conversions,
            -- Calculate performance metrics
            CASE
                WHEN COALESCE(ads.ad_spend, 0) > 0
                THEN COALESCE(aa.total_attributed_revenue, 0) / ads.ad_spend
                ELSE 0
            END AS roas,
            CASE
                WHEN COALESCE(ads.clicks, 0) > 0
                THEN COALESCE(ads.ad_spend, 0) / ads.clicks
                ELSE 0
            END AS cpc,
            CASE
                WHEN COALESCE(ads.impressions, 0) > 0
                THEN (COALESCE(ads.clicks, 0) * 100.0) / ads.impressions
                ELSE 0
            END AS ctr,
            -- Conditional VAT in profit calculation
            COALESCE(aa.total_attributed_revenue, 0) -
            CASE WHEN svs.ignore_vat = true THEN 0 ELSE COALESCE(aa.total_attributed_tax, 0) END -
            COALESCE(aa.total_attributed_cogs, 0) -
            COALESCE(aa.total_attributed_payment_fees, 0) -
            COALESCE(ads.ad_spend, 0) AS net_profit,
            -- First-time customer metrics
            COALESCE(aa.first_time_customer_orders, 0) AS first_time_customer_orders,
            COALESCE(aa.first_time_customer_revenue, 0) AS first_time_customer_revenue,
            CASE
                WHEN COALESCE(ads.ad_spend, 0) > 0
                THEN COALESCE(aa.first_time_customer_revenue, 0) / ads.ad_spend
                ELSE 0
            END AS first_time_customer_roas
        FROM ad_attribution aa
        FULL OUTER JOIN ad_spend ads ON
            aa.platform_ad_id = ads.platform_ad_id
            AND aa.platform_ad_set_id = ads.platform_ad_set_id
            AND aa.platform_ad_campaign_id = ads.platform_ad_campaign_id
        CROSS JOIN shop_vat_settings svs
        ORDER BY attributed_revenue DESC
      `;

      const queryParams = {
        shop_name: actualShopName,
        start_date: params.start_date,
        end_date: endDateStr,
        attribution_window: params.attribution_window,
        channel: params.channel,
      };

      logger.info('Executing pixel channel performance query', {
        accountId,
        params: queryParams,
      });

      const results = await clickhouseConnection.query<PixelChannelRawData>(query, queryParams);

      // Fetch metadata from Supabase
      const hierarchicalData = await this.fetchAndOrganizeMetadata(results, params.channel);

      const response: PixelChannelResponse = {
        data: hierarchicalData,
        metadata: {
          channel: params.channel,
          shop_name: actualShopName,
          start_date: params.start_date,
          end_date: params.end_date,
          attribution_model: params.attribution_model,
          attribution_window: params.attribution_window,
          total_campaigns: hierarchicalData.length,
          total_ad_sets: hierarchicalData.reduce((sum, c) => sum + c.ad_sets.length, 0),
          total_ads: hierarchicalData.reduce(
            (sum, c) => sum + c.ad_sets.reduce((adSum, as) => adSum + as.ads.length, 0),
            0
          ),
          query_timestamp: new Date().toISOString(),
        },
      };

      const executionTime = Date.now() - startTime;
      logger.info('Pixel channel performance query completed', {
        accountId,
        channel: params.channel,
        executionTimeMs: executionTime,
        resultCount: results.length,
        campaignCount: response.metadata.total_campaigns,
        adCount: response.metadata.total_ads,
      });

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error('Pixel channel performance query failed', {
        accountId,
        params,
        executionTimeMs: executionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async fetchAndOrganizeMetadata(
    rawData: PixelChannelRawData[],
    channel: string
  ): Promise<PixelChannelCampaignData[]> {
    try {
      const { supabaseConnection } = await import('@/database/supabase/connection.js');
      const supabase = supabaseConnection.getServiceClient();

      // Extract unique IDs
      const campaignIds = [...new Set(rawData.map((r) => r.ad_campaign_pk).filter((id) => id > 0))];
      const adSetIds = [...new Set(rawData.map((r) => r.ad_set_pk).filter((id) => id > 0))];
      const adIds = [...new Set(rawData.map((r) => r.ad_pk).filter((id) => id > 0))];

      logger.info('Fetching metadata from Supabase', {
        channel,
        campaignCount: campaignIds.length,
        adSetCount: adSetIds.length,
        adCount: adIds.length,
      });

      // Fetch metadata in parallel
      const [campaignsResult, adSetsResult, adsResult] = await Promise.all([
        campaignIds.length > 0
          ? supabase
              .from('ad_campaigns')
              .select('id, name, active, budget, ad_campaign_id, ad_accounts(ad_account_id)')
              .in('id', campaignIds)
          : { data: [], error: null },
        adSetIds.length > 0
          ? supabase
              .from('ad_sets')
              .select('id, name, active, budget, ad_set_id')
              .in('id', adSetIds)
          : { data: [], error: null },
        adIds.length > 0
          ? supabase.from('ads').select('id, name, active, image_url, ad_id').in('id', adIds)
          : { data: [], error: null },
      ]);

      if (campaignsResult.error) {
        logger.error('Failed to fetch campaign metadata', { error: campaignsResult.error });
      }
      if (adSetsResult.error) {
        logger.error('Failed to fetch ad set metadata', { error: adSetsResult.error });
      }
      if (adsResult.error) {
        logger.error('Failed to fetch ad metadata', { error: adsResult.error });
      }

      // Create lookup maps
      const campaignMap = new Map<number, CampaignMetadata>(
        (campaignsResult.data || []).map((c) => [
          c.id,
          {
            ...c,
            ad_accounts: Array.isArray(c.ad_accounts) ? c.ad_accounts[0] : c.ad_accounts,
          },
        ])
      );
      const adSetMap = new Map<number, AdSetMetadata>(
        (adSetsResult.data || []).map((as) => [as.id, as])
      );
      const adMap = new Map<number, AdMetadata>((adsResult.data || []).map((a) => [a.id, a]));

      // Organize data hierarchically
      const campaignDataMap = new Map<number, PixelChannelCampaignData>();
      const adSetDataMap = new Map<number, PixelChannelAdSetData>();

      // Process each raw data row
      for (const row of rawData) {
        // Skip rows with truly invalid IDs (null/undefined)
        // But allow 0 values which represent unknown campaigns
        if (
          row.ad_campaign_pk === null ||
          row.ad_campaign_pk === undefined ||
          row.ad_set_pk === null ||
          row.ad_set_pk === undefined ||
          row.ad_pk === null ||
          row.ad_pk === undefined
        ) {
          continue;
        }

        // Get or create campaign
        let campaignData = campaignDataMap.get(row.ad_campaign_pk);
        if (!campaignData) {
          const campaignMeta = campaignMap.get(row.ad_campaign_pk);
          const adAccountId = campaignMeta?.ad_accounts?.ad_account_id;

          // Special handling for campaign ID 0 (unknown campaigns)
          if (row.ad_campaign_pk === 0) {
            campaignData = {
              id: 0,
              platform_ad_campaign_id: '',
              name: 'Not Set', // Name for unknown campaigns
              active: false,
              budget: null,
              url: undefined, // No URL for unknown campaigns
              ad_sets: [],
              // Initialize aggregated metrics
              attributed_orders: 0,
              attributed_revenue: 0,
              distinct_orders_touched: 0,
              attributed_cogs: 0,
              attributed_payment_fees: 0,
              attributed_tax: 0,
              ad_spend: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              roas: 0,
              net_profit: 0,
              first_time_customer_orders: 0,
              first_time_customer_revenue: 0,
              first_time_customer_roas: 0,
            };
          } else {
            // Normal campaign handling
            // Use platform ID from ClickHouse if available, otherwise fall back to Supabase
            const platformCampaignId =
              row.platform_ad_campaign_id || campaignMeta?.ad_campaign_id || '';
            campaignData = {
              id: row.ad_campaign_pk,
              platform_ad_campaign_id: platformCampaignId,
              name: campaignMeta?.name || `Campaign ${platformCampaignId}`,
              active: campaignMeta?.active || false,
              budget: campaignMeta?.budget || null,
              url: this.generateAdManagerUrl(channel, 'campaign', platformCampaignId, adAccountId),
              ad_sets: [],
              // Initialize aggregated metrics
              attributed_orders: 0,
              attributed_revenue: 0,
              distinct_orders_touched: 0,
              attributed_cogs: 0,
              attributed_payment_fees: 0,
              attributed_tax: 0,
              ad_spend: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              roas: 0,
              net_profit: 0,
              first_time_customer_orders: 0,
              first_time_customer_revenue: 0,
              first_time_customer_roas: 0,
            };
          }
          campaignDataMap.set(row.ad_campaign_pk, campaignData);
        }

        // Get or create ad set
        let adSetData = adSetDataMap.get(row.ad_set_pk);
        if (!adSetData) {
          const adSetMeta = adSetMap.get(row.ad_set_pk);
          // Get ad account ID from the campaign
          const campaignMeta = campaignMap.get(row.ad_campaign_pk);
          const adAccountId = campaignMeta?.ad_accounts?.ad_account_id;

          if (row.ad_set_pk === 0) {
            // Special handling for ad set ID 0
            adSetData = {
              id: 0,
              platform_ad_set_id: '',
              name: 'Not Set',
              active: false,
              budget: null,
              url: undefined,
              ads: [],
              // Initialize aggregated metrics
              attributed_orders: 0,
              attributed_revenue: 0,
              distinct_orders_touched: 0,
              attributed_cogs: 0,
              attributed_payment_fees: 0,
              attributed_tax: 0,
              ad_spend: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              roas: 0,
              net_profit: 0,
              first_time_customer_orders: 0,
              first_time_customer_revenue: 0,
              first_time_customer_roas: 0,
            };
          } else {
            // Normal ad set handling
            // Use platform ID from ClickHouse if available, otherwise fall back to Supabase
            const platformAdSetId = row.platform_ad_set_id || adSetMeta?.ad_set_id || '';
            adSetData = {
              id: row.ad_set_pk,
              platform_ad_set_id: platformAdSetId,
              name: adSetMeta?.name || `Ad Set ${platformAdSetId}`,
              active: adSetMeta?.active || false,
              budget: adSetMeta?.budget || null,
              url: this.generateAdManagerUrl(channel, 'ad_set', platformAdSetId, adAccountId),
              ads: [],
              // Initialize aggregated metrics
              attributed_orders: 0,
              attributed_revenue: 0,
              distinct_orders_touched: 0,
              attributed_cogs: 0,
              attributed_payment_fees: 0,
              attributed_tax: 0,
              ad_spend: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              roas: 0,
              net_profit: 0,
              first_time_customer_orders: 0,
              first_time_customer_revenue: 0,
              first_time_customer_roas: 0,
            };
          }
          adSetDataMap.set(row.ad_set_pk, adSetData);
          campaignData.ad_sets.push(adSetData);
        }

        // Create ad
        const adMeta = adMap.get(row.ad_pk);
        // Get ad account ID from the campaign
        const campaignMeta = campaignMap.get(row.ad_campaign_pk);
        const adAccountId = campaignMeta?.ad_accounts?.ad_account_id;

        // Handle ad ID 0 specially
        const platformAdId = row.ad_pk === 0 ? '' : row.platform_ad_id || adMeta?.ad_id || '';
        const adName = row.ad_pk === 0 ? 'Not Set' : adMeta?.name || `Ad ${platformAdId}`;
        const adUrl =
          row.ad_pk === 0
            ? undefined
            : this.generateAdManagerUrl(channel, 'ad', platformAdId, adAccountId);

        const adData: PixelChannelAdData = {
          id: row.ad_pk,
          platform_ad_id: platformAdId,
          name: adName,
          active: row.ad_pk === 0 ? false : adMeta?.active || false,
          image_url: row.ad_pk === 0 ? null : adMeta?.image_url || null,
          url: adUrl,
          // Metrics from ClickHouse
          attributed_orders: Number(row.attributed_orders),
          attributed_revenue: Number(row.attributed_revenue),
          distinct_orders_touched: Number(row.distinct_orders_touched),
          attributed_cogs: Number(row.attributed_cogs),
          attributed_payment_fees: Number(row.attributed_payment_fees),
          attributed_tax: Number(row.attributed_tax),
          ad_spend: Number(row.ad_spend),
          impressions: Number(row.impressions),
          clicks: Number(row.clicks),
          conversions: Number(row.conversions),
          roas: Number(row.roas),
          cpc: Number(row.cpc),
          ctr: Number(row.ctr),
          net_profit: Number(row.net_profit),
          first_time_customer_orders: Number(row.first_time_customer_orders),
          first_time_customer_revenue: Number(row.first_time_customer_revenue),
          first_time_customer_roas: Number(row.first_time_customer_roas),
        };

        // Add ad to ad set
        adSetData.ads.push(adData);

        // Aggregate metrics to ad set
        adSetData.attributed_orders += adData.attributed_orders;
        adSetData.attributed_revenue += adData.attributed_revenue;
        adSetData.distinct_orders_touched = Math.max(
          adSetData.distinct_orders_touched,
          adData.distinct_orders_touched
        );
        adSetData.attributed_cogs += adData.attributed_cogs;
        adSetData.attributed_payment_fees += adData.attributed_payment_fees;
        adSetData.attributed_tax += adData.attributed_tax;
        adSetData.ad_spend += adData.ad_spend;
        adSetData.impressions += adData.impressions;
        adSetData.clicks += adData.clicks;
        adSetData.conversions += adData.conversions;
        adSetData.net_profit += adData.net_profit;
        adSetData.first_time_customer_orders += adData.first_time_customer_orders;
        adSetData.first_time_customer_revenue += adData.first_time_customer_revenue;

        // Aggregate metrics to campaign
        campaignData.attributed_orders += adData.attributed_orders;
        campaignData.attributed_revenue += adData.attributed_revenue;
        campaignData.distinct_orders_touched = Math.max(
          campaignData.distinct_orders_touched,
          adData.distinct_orders_touched
        );
        campaignData.attributed_cogs += adData.attributed_cogs;
        campaignData.attributed_payment_fees += adData.attributed_payment_fees;
        campaignData.attributed_tax += adData.attributed_tax;
        campaignData.ad_spend += adData.ad_spend;
        campaignData.impressions += adData.impressions;
        campaignData.clicks += adData.clicks;
        campaignData.conversions += adData.conversions;
        campaignData.net_profit += adData.net_profit;
        campaignData.first_time_customer_orders += adData.first_time_customer_orders;
        campaignData.first_time_customer_revenue += adData.first_time_customer_revenue;
      }

      // Calculate ROAS for ad sets and campaigns
      for (const adSetData of adSetDataMap.values()) {
        adSetData.roas =
          adSetData.ad_spend > 0 ? adSetData.attributed_revenue / adSetData.ad_spend : 0;
        adSetData.first_time_customer_roas =
          adSetData.ad_spend > 0 ? adSetData.first_time_customer_revenue / adSetData.ad_spend : 0;
      }

      for (const campaignData of campaignDataMap.values()) {
        campaignData.roas =
          campaignData.ad_spend > 0 ? campaignData.attributed_revenue / campaignData.ad_spend : 0;
        campaignData.first_time_customer_roas =
          campaignData.ad_spend > 0
            ? campaignData.first_time_customer_revenue / campaignData.ad_spend
            : 0;
      }

      return Array.from(campaignDataMap.values());
    } catch (error) {
      logger.error('Failed to fetch and organize metadata', {
        channel,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get dashboard metrics with timezone-aware aggregation
   *
   * TIMEZONE HANDLING:
   * - Uses order_timestamp_local from int_order_enriched (converted from UTC in dbt)
   * - Ensures hourly/daily aggregations align with shop's local timezone
   * - Fixes issue where orders near midnight were assigned to wrong day
   * - New customer calculations now correctly match local timezone timestamps
   *
   * @param accountId - The account ID to fetch metrics for
   * @param params - Query parameters including start_date and end_date
   * @returns Dashboard metrics with hourly or daily aggregation
   */
  async getDashboardMetrics(
    accountId: string,
    params: DashboardMetricsQuery['query']
  ): Promise<DashboardMetricsResponse> {
    const startTime = Date.now();

    try {
      // Get shop name from account ID
      const actualShopName = await getShopNameFromAccountId(accountId);
      logger.info('Resolved shop name from account', { accountId, actualShopName });

      // Validate and prepare date range
      const startDate = new Date(params.start_date);
      const endDate = new Date(params.end_date);
      validateDateRange(startDate, endDate);

      // Determine if we should use hourly or daily aggregation
      const isHourly = shouldUseHourlyAggregation(startDate, endDate);

      // Make end date inclusive for query
      const endDateInclusive = makeEndDateInclusive(endDate);

      let query: string;
      let queryParams: Record<string, any>;

      if (isHourly) {
        // Hourly aggregation query
        query = `
          WITH shop_settings AS (
            SELECT 
              shop_name,
              ignore_vat
            FROM stg_shopify_shops
            WHERE shop_name = {shop_name:String}
            LIMIT 1
          ),
          ad_spend_hourly AS (
            SELECT
              toStartOfHour(date_time) as hour,
              SUM(spend) as total_ad_spend
            FROM int_ad_spend
            WHERE date_time >= {start_datetime:DateTime}
              AND date_time < {end_datetime:DateTime}
              AND shop_name = {shop_name:String}
            GROUP BY toStartOfHour(date_time)
          ),
          order_metrics_hourly AS (
            SELECT
              toStartOfHour(date) as hour,
              SUM(revenue) as total_revenue,
              SUM(cogs) as total_cogs,
              SUM(vat) as total_vat,
              SUM(payment_fees) as total_payment_fees,
              SUM(orders) as total_orders
            FROM int_order_metrics
            WHERE date >= {start_datetime:DateTime}
              AND date < {end_datetime:DateTime}
              AND shopify_name = {shop_name:String}
            GROUP BY toStartOfHour(date)
          ),
          refunds_hourly AS (
            SELECT
              toStartOfHour(date) as hour,
              SUM(refunds) as total_refunds
            FROM int_refunds
            WHERE date >= {start_datetime:DateTime}
              AND date < {end_datetime:DateTime}
              AND shopify_name = {shop_name:String}
            GROUP BY toStartOfHour(date)
          ),
          new_customer_hourly AS (
            SELECT
              toStartOfHour(oe.order_timestamp_local) as hour,
              COUNT(DISTINCT oe.customer_email) as new_customer_count,
              SUM(oe.total_price) as new_customer_revenue
            FROM int_order_enriched oe
            INNER JOIN int_customer_first_purchase cfp
              ON oe.customer_email = cfp.customer_email
              AND oe.shopify_shop = cfp.shopify_shop
            WHERE oe.shopify_shop = {shop_name:String}
              AND oe.order_timestamp_local >= {start_datetime:DateTime}
              AND oe.order_timestamp_local < {end_datetime:DateTime}
              AND toStartOfHour(oe.order_timestamp_local) = toStartOfHour(cfp.first_order_datetime_local)
            GROUP BY toStartOfHour(oe.order_timestamp_local)
          ),
          all_hours AS (
            SELECT hour FROM ad_spend_hourly
            UNION ALL
            SELECT hour FROM order_metrics_hourly
            UNION ALL
            SELECT hour FROM refunds_hourly
            UNION ALL
            SELECT hour FROM new_customer_hourly
          )
          SELECT
            toString(h.hour) as timestamp,
            COALESCE(o.total_orders, 0) as total_orders,
            COALESCE(o.total_revenue, 0) as total_revenue,
            COALESCE(r.total_refunds, 0) as total_refunds,
            COALESCE(o.total_cogs, 0) as total_cogs,
            COALESCE(a.total_ad_spend, 0) as total_ad_spend,
            COALESCE(o.total_revenue, 0) -
              CASE WHEN s.ignore_vat = true THEN 0 ELSE COALESCE(o.total_vat, 0) END -
              COALESCE(a.total_ad_spend, 0) -
              COALESCE(o.total_cogs, 0) -
              COALESCE(o.total_payment_fees, 0) -
              COALESCE(r.total_refunds, 0) as profit,
            CASE
              WHEN COALESCE(a.total_ad_spend, 0) > 0
              THEN COALESCE(o.total_revenue, 0) / a.total_ad_spend
              ELSE 0
            END as roas,
            COALESCE(nc.new_customer_count, 0) as new_customer_count,
            COALESCE(nc.new_customer_revenue, 0) as new_customer_revenue,
            CASE
              WHEN COALESCE(a.total_ad_spend, 0) > 0
              THEN COALESCE(nc.new_customer_revenue, 0) / a.total_ad_spend
              ELSE 0
            END as new_customer_roas,
            CASE
              WHEN COALESCE(nc.new_customer_count, 0) > 0
              THEN COALESCE(a.total_ad_spend, 0) / nc.new_customer_count
              ELSE 0
            END as cac
          FROM (SELECT DISTINCT hour FROM all_hours) h
          LEFT JOIN ad_spend_hourly a ON h.hour = a.hour
          LEFT JOIN order_metrics_hourly o ON h.hour = o.hour
          LEFT JOIN refunds_hourly r ON h.hour = r.hour
          LEFT JOIN new_customer_hourly nc ON h.hour = nc.hour
          CROSS JOIN shop_settings s
          ORDER BY h.hour ASC
        `;

        queryParams = {
          shop_name: actualShopName,
          start_datetime: `${params.start_date} 00:00:00`,
          end_datetime: `${params.end_date} 23:59:59`,
          start_date: params.start_date,
        };
      } else {
        // Daily aggregation query
        query = `
          WITH shop_settings AS (
            SELECT 
              shop_name,
              ignore_vat
            FROM stg_shopify_shops
            WHERE shop_name = {shop_name:String}
            LIMIT 1
          ),
          daily_ad_spend AS (
            SELECT
              toDate(date_time) as day,
              SUM(spend) as total_ad_spend
            FROM int_ad_spend
            WHERE date_time >= {start_date:String}
              AND date_time < {end_date:String}
              AND shop_name = {shop_name:String}
            GROUP BY toDate(date_time)
          ),
          daily_order_metrics AS (
            SELECT
              toDate(date) as day,
              SUM(revenue) as total_revenue,
              SUM(cogs) as total_cogs,
              SUM(vat) as total_vat,
              SUM(payment_fees) as total_payment_fees,
              SUM(orders) as total_orders
            FROM int_order_metrics
            WHERE date >= {start_date:String}
              AND date < {end_date:String}
              AND shopify_name = {shop_name:String}
            GROUP BY toDate(date)
          ),
          daily_refunds AS (
            SELECT
              toDate(date) as day,
              SUM(refunds) as total_refunds
            FROM int_refunds
            WHERE date >= {start_date:String}
              AND date < {end_date:String}
              AND shopify_name = {shop_name:String}
            GROUP BY toDate(date)
          ),
          new_customer_daily AS (
            SELECT
              toDate(oe.order_timestamp_local) as day,
              COUNT(DISTINCT oe.customer_email) as new_customer_count,
              SUM(oe.total_price) as new_customer_revenue
            FROM int_order_enriched oe
            INNER JOIN int_customer_first_purchase cfp
              ON oe.customer_email = cfp.customer_email
              AND oe.shopify_shop = cfp.shopify_shop
            WHERE oe.shopify_shop = {shop_name:String}
              AND oe.order_timestamp_local >= {start_date:String}
              AND oe.order_timestamp_local < {end_date:String}
              AND toDate(oe.order_timestamp_local) = toDate(cfp.first_order_datetime_local)
            GROUP BY toDate(oe.order_timestamp_local)
          ),
          all_days AS (
            SELECT day FROM daily_ad_spend
            UNION ALL
            SELECT day FROM daily_order_metrics
            UNION ALL
            SELECT day FROM daily_refunds
            UNION ALL
            SELECT day FROM new_customer_daily
          )
          SELECT
            toString(d.day) as timestamp,
            COALESCE(o.total_orders, 0) as total_orders,
            COALESCE(o.total_revenue, 0) as total_revenue,
            COALESCE(r.total_refunds, 0) as total_refunds,
            COALESCE(o.total_cogs, 0) as total_cogs,
            COALESCE(a.total_ad_spend, 0) as total_ad_spend,
            COALESCE(o.total_revenue, 0) -
              CASE WHEN s.ignore_vat = true THEN 0 ELSE COALESCE(o.total_vat, 0) END -
              COALESCE(a.total_ad_spend, 0) -
              COALESCE(o.total_cogs, 0) -
              COALESCE(o.total_payment_fees, 0) -
              COALESCE(r.total_refunds, 0) as profit,
            CASE
              WHEN COALESCE(a.total_ad_spend, 0) > 0
              THEN COALESCE(o.total_revenue, 0) / a.total_ad_spend
              ELSE 0
            END as roas,
            COALESCE(nc.new_customer_count, 0) as new_customer_count,
            COALESCE(nc.new_customer_revenue, 0) as new_customer_revenue,
            CASE
              WHEN COALESCE(a.total_ad_spend, 0) > 0
              THEN COALESCE(nc.new_customer_revenue, 0) / a.total_ad_spend
              ELSE 0
            END as new_customer_roas,
            CASE
              WHEN COALESCE(nc.new_customer_count, 0) > 0
              THEN COALESCE(a.total_ad_spend, 0) / nc.new_customer_count
              ELSE 0
            END as cac
          FROM (SELECT DISTINCT day FROM all_days) d
          LEFT JOIN daily_ad_spend a ON d.day = a.day
          LEFT JOIN daily_order_metrics o ON d.day = o.day
          LEFT JOIN daily_refunds r ON d.day = r.day
          LEFT JOIN new_customer_daily nc ON d.day = nc.day
          CROSS JOIN shop_settings s
          ORDER BY d.day ASC
        `;

        queryParams = {
          shop_name: actualShopName,
          start_date: params.start_date,
          end_date: endDateInclusive.toISOString().split('T')[0],
        };
      }

      logger.info('Executing dashboard metrics query', {
        accountId,
        shopName: actualShopName,
        aggregationLevel: isHourly ? 'hourly' : 'daily',
        params: queryParams,
      });

      const results = await clickhouseConnection.query<DashboardMetricsTimeseries>(
        query,
        queryParams
      );

      // Filter out any invalid timestamps (nulls that got converted to epoch)
      // AND convert all numeric fields from ClickHouse strings to numbers
      const validResults = results
        .filter((row) => {
          const timestamp = new Date(row.timestamp);
          return timestamp.getFullYear() > 1970;
        })
        .map((row) => ({
          timestamp: row.timestamp,
          total_orders: Number(row.total_orders),
          total_revenue: Number(row.total_revenue),
          total_refunds: Number(row.total_refunds),
          total_cogs: Number(row.total_cogs),
          total_ad_spend: Number(row.total_ad_spend),
          profit: Number(row.profit),
          roas: Number(row.roas),
          new_customer_count: Number(row.new_customer_count),
          new_customer_revenue: Number(row.new_customer_revenue),
          new_customer_roas: Number(row.new_customer_roas),
          cac: Number(row.cac),
        }));

      const response: DashboardMetricsResponse = {
        data: {
          timeseries: validResults,
          aggregation_level: isHourly ? 'hourly' : 'daily',
        },
        metadata: {
          shop_name: actualShopName,
          start_date: params.start_date,
          end_date: params.end_date,
          query_timestamp: new Date().toISOString(),
        },
      };

      const executionTime = Date.now() - startTime;
      logger.info('Dashboard metrics query completed', {
        accountId,
        shopName: actualShopName,
        executionTimeMs: executionTime,
        resultCount: results.length,
        aggregationLevel: response.data.aggregation_level,
      });

      return response;
    } catch (error) {
      logger.error('Failed to get dashboard metrics', {
        accountId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
