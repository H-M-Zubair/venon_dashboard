/**
 * Event-Based Attribution Analytics Service
 *
 * Provides attribution analytics based on event timestamps (int_event_metadata table)
 * rather than pre-calculated attribution windows.
 *
 * Key differences from order-based attribution:
 * - Queries raw event data instead of pre-calculated tables
 * - Filters by event_timestamp instead of order_timestamp + attribution_window
 * - Uses event position flags (is_first_event_overall, is_last_event_overall, etc.)
 * - Calculates attribution weights in real-time for linear models
 */

import { clickhouseConnection } from '@/database/clickhouse/connection.js';
import logger from '@/config/logger.js';
import { isAdSpendChannel } from '@/config/channels.js';
import {
  buildEventBasedChannelQuery,
  buildEventBasedAdLevelQuery,
  buildEventBasedCampaignQuery,
  type AttributionModel,
} from '@/utils/event-attribution-query-builder.js';
import { getShopNameFromAccountId } from '@/utils/account-helpers.js';
import { validateDateRange, makeEndDateInclusiveAndFormat } from '@/utils/date-helpers.js';
import type {
  EventBasedChannelPerformanceQuery,
  EventBasedPixelChannelQuery,
  ChannelPerformanceResponse,
  ChannelPerformanceData,
  PixelChannelResponse,
  PixelChannelRawData,
  CampaignLevelResponse,
  CampaignLevelRawData,
  CampaignLevelData,
  PixelChannelCampaignData,
  CampaignMetadata,
  AdSetMetadata,
  AdMetadata,
  PixelChannelAdSetData,
  PixelChannelAdData,
} from '@/types/analytics.js';

export class EventBasedAnalyticsService {
  /**
   * Get channel-level performance using event-based attribution
   * Aggregates metrics across all channels based on events in the date range
   */
  async getEventBasedChannelPerformance(
    accountId: string,
    params: Omit<EventBasedChannelPerformanceQuery['query'], 'account_id'>
  ): Promise<ChannelPerformanceResponse> {
    const startTime = Date.now();

    try {
      // Get shop name from account ID
      const actualShopName = await getShopNameFromAccountId(accountId);

      logger.info('Resolved shop name for event-based channel performance', {
        accountId,
        actualShopName,
      });

      // Validate and prepare date range
      const startDate = new Date(params.start_date);
      const endDate = new Date(params.end_date);
      validateDateRange(startDate, endDate);

      // Make end date inclusive for query
      const endDateStr = makeEndDateInclusiveAndFormat(endDate);

      // Build query using the query builder
      const query = buildEventBasedChannelQuery(params.attribution_model as AttributionModel, {
        shop_name: actualShopName,
        start_date: params.start_date,
        end_date: endDateStr,
      });

      const queryParams = {
        shop_name: actualShopName,
        start_date: params.start_date,
        end_date: endDateStr,
      };

      logger.info('Executing event-based channel performance query', {
        accountId,
        model: params.attribution_model,
        params: queryParams,
      });

      const results = await clickhouseConnection.query<ChannelPerformanceData>(query, queryParams);

      logger.info('Event-based channel performance results', {
        resultCount: results.length,
        channels: results.map((r) => r.channel),
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
          shop_name: actualShopName,
          start_date: params.start_date,
          end_date: params.end_date,
          attribution_model: params.attribution_model,
          attribution_window: 'event_based', // Indicate this is event-based
          total_channels: results.length,
          query_timestamp: new Date().toISOString(),
        },
      };

      const executionTime = Date.now() - startTime;
      logger.info('Event-based channel performance query completed', {
        accountId,
        executionTimeMs: executionTime,
        resultCount: results.length,
      });

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error('Event-based channel performance query failed', {
        accountId,
        params,
        executionTimeMs: executionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get pixel channel performance using event-based attribution
   * For paid channels: Returns ad hierarchy (campaigns -> ad sets -> ads)
   * For non-paid channels: Returns campaign list
   */
  async getEventBasedPixelChannelPerformance(
    accountId: string,
    params: Omit<EventBasedPixelChannelQuery['query'], 'account_id'>
  ): Promise<PixelChannelResponse | CampaignLevelResponse> {
    const startTime = Date.now();

    try {
      // Get shop name from account ID
      const actualShopName = await getShopNameFromAccountId(accountId);

      logger.info('Resolved shop name for event-based pixel channel performance', {
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

      // Determine if this is a paid or non-paid channel
      const isPaidChannel = isAdSpendChannel(params.channel);

      if (isPaidChannel) {
        // Paid channel: Use ad-level query and return hierarchical data
        return await this.getEventBasedAdLevelPerformance(
          accountId,
          actualShopName,
          params,
          endDateStr
        );
      } else {
        // Non-paid channel: Use campaign-level query
        return await this.getEventBasedCampaignLevelPerformance(
          accountId,
          actualShopName,
          params,
          endDateStr
        );
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error('Event-based pixel channel performance query failed', {
        accountId,
        params,
        executionTimeMs: executionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get ad-level performance for paid channels
   * Returns hierarchical campaign -> ad set -> ad structure
   */
  private async getEventBasedAdLevelPerformance(
    accountId: string,
    shopName: string,
    params: Omit<EventBasedPixelChannelQuery['query'], 'account_id'>,
    endDateStr: string
  ): Promise<PixelChannelResponse> {
    const startTime = Date.now();

    // Build ad-level query
    const query = buildEventBasedAdLevelQuery(params.attribution_model as AttributionModel, {
      shop_name: shopName,
      start_date: params.start_date,
      end_date: endDateStr,
      channel: params.channel,
    });

    const queryParams = {
      shop_name: shopName,
      start_date: params.start_date,
      end_date: endDateStr,
      channel: params.channel,
    };

    logger.info('Executing event-based ad-level query', {
      accountId,
      channel: params.channel,
      model: params.attribution_model,
      params: queryParams,
    });

    const results = await clickhouseConnection.query<PixelChannelRawData>(query, queryParams);

    // Fetch and organize metadata into hierarchical structure
    const hierarchicalData = await this.fetchAndOrganizeAdMetadata(results, params.channel);

    const response: PixelChannelResponse = {
      data: hierarchicalData,
      metadata: {
        channel: params.channel,
        shop_name: shopName,
        start_date: params.start_date,
        end_date: params.end_date,
        attribution_model: params.attribution_model,
        attribution_window: 'event_based',
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
    logger.info('Event-based ad-level query completed', {
      accountId,
      channel: params.channel,
      executionTimeMs: executionTime,
      campaignCount: response.metadata.total_campaigns,
    });

    return response;
  }

  /**
   * Get campaign-level performance for non-paid channels
   * Returns flat list of campaigns with metrics
   */
  private async getEventBasedCampaignLevelPerformance(
    accountId: string,
    shopName: string,
    params: Omit<EventBasedPixelChannelQuery['query'], 'account_id'>,
    endDateStr: string
  ): Promise<CampaignLevelResponse> {
    const startTime = Date.now();

    // Build campaign-level query
    const query = buildEventBasedCampaignQuery(params.attribution_model as AttributionModel, {
      shop_name: shopName,
      start_date: params.start_date,
      end_date: endDateStr,
      channel: params.channel,
    });

    const queryParams = {
      shop_name: shopName,
      start_date: params.start_date,
      end_date: endDateStr,
      channel: params.channel,
    };

    logger.info('Executing event-based campaign-level query', {
      accountId,
      channel: params.channel,
      model: params.attribution_model,
      params: queryParams,
    });

    const results = await clickhouseConnection.query<CampaignLevelRawData>(query, queryParams);

    // Transform results into response format
    const campaignData: CampaignLevelData[] = results.map((row) => ({
      campaign: row.campaign,
      name: row.campaign || 'Not Set', // Use campaign name as display name
      attributed_orders: Number(row.attributed_orders),
      attributed_revenue: Number(row.attributed_revenue),
      distinct_orders_touched: Number(row.distinct_orders_touched),
      attributed_cogs: Number(row.attributed_cogs),
      attributed_payment_fees: Number(row.attributed_payment_fees),
      attributed_tax: Number(row.attributed_tax),
      net_profit: Number(row.net_profit),
      first_time_customer_orders: Number(row.first_time_customer_orders),
      first_time_customer_revenue: Number(row.first_time_customer_revenue),
    }));

    const response: CampaignLevelResponse = {
      data: campaignData,
      metadata: {
        channel: params.channel,
        shop_name: shopName,
        start_date: params.start_date,
        end_date: params.end_date,
        attribution_model: params.attribution_model,
        total_campaigns: campaignData.length,
        query_timestamp: new Date().toISOString(),
      },
    };

    const executionTime = Date.now() - startTime;
    logger.info('Event-based campaign-level query completed', {
      accountId,
      channel: params.channel,
      executionTimeMs: executionTime,
      campaignCount: campaignData.length,
    });

    return response;
  }

  /**
   * Fetch ad metadata from Supabase and organize into hierarchical structure
   * Reuses logic from AnalyticsService but adapted for event-based data
   */
  private async fetchAndOrganizeAdMetadata(
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

      logger.info('Fetching ad metadata from Supabase', {
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

      // Organize data hierarchically (same logic as AnalyticsService)
      const campaignDataMap = new Map<number, PixelChannelCampaignData>();
      const adSetDataMap = new Map<number, PixelChannelAdSetData>();

      for (const row of rawData) {
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

          if (row.ad_campaign_pk === 0) {
            campaignData = {
              id: 0,
              platform_ad_campaign_id: '',
              name: 'Not Set',
              active: false,
              budget: null,
              url: undefined,
              ad_sets: [],
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
          const campaignMeta = campaignMap.get(row.ad_campaign_pk);
          const adAccountId = campaignMeta?.ad_accounts?.ad_account_id;

          if (row.ad_set_pk === 0) {
            adSetData = {
              id: 0,
              platform_ad_set_id: '',
              name: 'Not Set',
              active: false,
              budget: null,
              url: undefined,
              ads: [],
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
            const platformAdSetId = row.platform_ad_set_id || adSetMeta?.ad_set_id || '';
            adSetData = {
              id: row.ad_set_pk,
              platform_ad_set_id: platformAdSetId,
              name: adSetMeta?.name || `Ad Set ${platformAdSetId}`,
              active: adSetMeta?.active || false,
              budget: adSetMeta?.budget || null,
              url: this.generateAdManagerUrl(channel, 'ad_set', platformAdSetId, adAccountId),
              ads: [],
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
        const campaignMeta = campaignMap.get(row.ad_campaign_pk);
        const adAccountId = campaignMeta?.ad_accounts?.ad_account_id;

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
      logger.error('Failed to fetch and organize ad metadata', {
        channel,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Generate ad manager URLs for different platforms
   * Reused from AnalyticsService
   */
  private generateAdManagerUrl(
    platform: string,
    entityType: 'campaign' | 'ad_set' | 'ad',
    platformId: string,
    adAccountId?: string
  ): string | undefined {
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
        if (entityType === 'campaign' && platformId) {
          return `https://ads.google.com/aw/campaigns?campaignId=${platformId}`;
        }
        break;

      case 'taboola':
        if (entityType === 'campaign' && platformId) {
          return `https://ads.taboola.com/campaigns?campaignId=${platformId}`;
        }
        break;
    }

    return undefined;
  }
}
