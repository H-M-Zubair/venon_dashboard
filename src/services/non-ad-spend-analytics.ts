import { clickhouseConnection } from '@/database/clickhouse/connection.js';
import {
  NonAdSpendAnalyticsRequest,
  NonAdSpendCampaign,
  NonAdSpendAnalyticsResponse,
} from '@/types/non-ad-spend-analytics.js';
import logger from '@/config/logger.js';
import { getAttributionTableName } from '@/utils/attribution-tables.js';

export class NonAdSpendAnalyticsService {
  async getCampaignAnalytics(
    params: NonAdSpendAnalyticsRequest
  ): Promise<NonAdSpendAnalyticsResponse> {
    try {
      // Get shop name from account ID using Supabase
      const { supabaseConnection } = await import('@/database/supabase/connection.js');
      const supabase = supabaseConnection.getServiceClient();

      const { data: shopData, error: shopError } = await supabase
        .from('shopify_shops')
        .select('shop_name')
        .eq('account_id', params.accountId)
        .single();

      if (shopError || !shopData) {
        logger.error('Failed to find shop for account', { accountId: params.accountId, shopError });
        throw new Error('Shop not found for account');
      }

      const shopName = shopData.shop_name;

      // Get the appropriate table name based on attribution model
      const tableName = getAttributionTableName(params.attributionModel);

      const query = `
        WITH campaign_attribution AS (
          SELECT
            channel,
            shopify_shop,
            campaign,
            SUM(attribution_weight) AS total_attributed_orders,
            SUM(attributed_revenue) AS total_attributed_revenue,
            COUNT(DISTINCT order_id) AS distinct_orders_touched,
            SUM(attributed_cogs) AS total_attributed_cogs,
            SUM(attributed_payment_fees) AS total_attributed_payment_fees,
            SUM(attributed_tax) AS total_attributed_tax,
            SUM(CASE WHEN is_first_customer_order = 1 THEN attribution_weight ELSE 0 END) AS first_time_customer_orders,
            SUM(CASE WHEN is_first_customer_order = 1 THEN attributed_revenue ELSE 0 END) AS first_time_customer_revenue
          FROM ${tableName}
          WHERE shopify_shop = {shopName: String}
            AND order_timestamp >= {startDate: String}
            AND order_timestamp < {endDate: String} + INTERVAL 1 DAY
            AND attribution_window = {attributionWindow: String}
            AND channel = {channel: String}
          GROUP BY
            channel,
            shopify_shop,
            campaign
        ),
        shop_vat_settings AS (
          SELECT
            shop_name,
            COALESCE(ignore_vat, false) AS ignore_vat
          FROM stg_shopify_shops
          WHERE shop_name = {shopName: String}
        )
        SELECT
          ca.channel,
          ca.campaign,
          ca.total_attributed_orders AS attributed_orders,
          ca.total_attributed_revenue AS attributed_revenue,
          ca.distinct_orders_touched,
          ca.total_attributed_cogs AS attributed_cogs,
          ca.total_attributed_payment_fees AS attributed_payment_fees,
          ca.total_attributed_tax AS attributed_tax,
          -- Calculate gross profit (revenue minus VAT if applicable)
          ca.total_attributed_revenue - 
          CASE WHEN svs.ignore_vat = true THEN 0 ELSE ca.total_attributed_tax END AS gross_revenue,
          -- Calculate net profit (no ad spend for these channels)
          ca.total_attributed_revenue -
          CASE WHEN svs.ignore_vat = true THEN 0 ELSE ca.total_attributed_tax END -
          ca.total_attributed_cogs -
          ca.total_attributed_payment_fees AS net_profit,
          -- Calculate profit margin
          CASE
            WHEN ca.total_attributed_revenue > 0
            THEN (
              (ca.total_attributed_revenue -
               CASE WHEN svs.ignore_vat = true THEN 0 ELSE ca.total_attributed_tax END -
               ca.total_attributed_cogs -
               ca.total_attributed_payment_fees) / ca.total_attributed_revenue
            ) * 100
            ELSE 0
          END AS profit_margin_pct,
          -- Average order value
          CASE
            WHEN ca.total_attributed_orders > 0
            THEN ca.total_attributed_revenue / ca.total_attributed_orders
            ELSE 0
          END AS avg_order_value,
          -- Revenue per unique order touched
          CASE
            WHEN ca.distinct_orders_touched > 0
            THEN ca.total_attributed_revenue / ca.distinct_orders_touched
            ELSE 0
          END AS revenue_per_order_touched,
          -- First-time customer metrics
          ca.first_time_customer_orders,
          ca.first_time_customer_revenue
        FROM campaign_attribution ca
        CROSS JOIN shop_vat_settings svs
        ORDER BY ca.channel, ca.total_attributed_revenue DESC
      `;

      const queryParams = {
        shopName,
        startDate: params.startDate,
        endDate: params.endDate,
        attributionWindow: params.attributionWindow,
        channel: params.channel,
      };

      logger.info('Executing non-ad-spend analytics query', { params: queryParams });
      const campaigns = await clickhouseConnection.query<NonAdSpendCampaign>(query, queryParams);

      // Process campaigns to ensure numeric values
      const processedCampaigns = campaigns.map((campaign) => ({
        ...campaign,
        attributed_orders: Number(campaign.attributed_orders),
        attributed_revenue: Number(campaign.attributed_revenue),
        distinct_orders_touched: Number(campaign.distinct_orders_touched),
        attributed_cogs: Number(campaign.attributed_cogs),
        attributed_payment_fees: Number(campaign.attributed_payment_fees),
        attributed_tax: Number(campaign.attributed_tax),
        gross_revenue: Number(campaign.gross_revenue),
        net_profit: Number(campaign.net_profit),
        profit_margin_pct: Number(campaign.profit_margin_pct),
        avg_order_value: Number(campaign.avg_order_value),
        revenue_per_order_touched: Number(campaign.revenue_per_order_touched),
        first_time_customer_orders: Number(campaign.first_time_customer_orders),
        first_time_customer_revenue: Number(campaign.first_time_customer_revenue),
      }));

      logger.info(
        `Found ${processedCampaigns.length} campaigns for non-ad-spend channel ${params.channel}`
      );

      return {
        success: true,
        result: {
          data: processedCampaigns,
          metadata: {
            shop_name: shopName,
            channel: params.channel,
            start_date: params.startDate,
            end_date: params.endDate,
            attribution_model: params.attributionModel,
            attribution_window: params.attributionWindow,
            query_timestamp: new Date().toISOString(),
          },
        },
      };
    } catch (error) {
      logger.error('Error fetching non-ad-spend analytics', { error, params });
      throw error;
    }
  }
}
