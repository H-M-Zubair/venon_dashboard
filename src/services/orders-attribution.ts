import { clickhouseConnection } from '@/database/clickhouse/connection.js';
import {
  OrdersAttributionRequest,
  OrderInfo,
  OrdersAttributionResponse,
} from '@/types/orders-attribution.js';
import logger from '@/config/logger.js';
import { getAttributionTableName } from '@/utils/attribution-tables.js';
import { isAdSpendChannel } from '@/config/channels.js';

export class OrdersAttributionService {
  async getOrdersForAttribution(
    params: OrdersAttributionRequest
  ): Promise<OrdersAttributionResponse> {
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

      // Determine if this is an ad-spend channel
      const isAdSpend = isAdSpendChannel(params.channel);

      // Build the WHERE clause conditions
      const whereConditions = [
        'shopify_shop = {shopName: String}',
        'order_timestamp >= {startDate: String}',
        'order_timestamp < {endDate: String} + INTERVAL 1 DAY',
        'attribution_window = {attributionWindow: String}',
        'channel = {channel: String}',
      ];

      // Add channel-specific filters
      if (isAdSpend) {
        // For ad-spend channels, filter by ad campaign/set/ad PKs
        if (params.adCampaignPk) {
          whereConditions.push('ad_campaign_pk = {adCampaignPk: String}');
        }
        if (params.adSetPk) {
          whereConditions.push('ad_set_pk = {adSetPk: String}');
        }
        if (params.adPk) {
          whereConditions.push('ad_pk = {adPk: String}');
        }
      } else {
        // For non-ad-spend channels, filter by campaign name
        if (params.campaign) {
          whereConditions.push('campaign = {campaign: String}');
        }
      }

      // Add first-time customers filter
      if (params.firstTimeCustomersOnly) {
        whereConditions.push('is_first_customer_order = 1');
      }

      const query = `
        SELECT DISTINCT
          order_id,
          order_number,
          order_timestamp,
          is_first_customer_order
        FROM ${tableName}
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY order_timestamp DESC, order_id
      `;

      const queryParams: Record<string, any> = {
        shopName,
        startDate: params.startDate,
        endDate: params.endDate,
        attributionWindow: params.attributionWindow,
        channel: params.channel,
      };

      // Add optional parameters
      if (isAdSpend) {
        if (params.adCampaignPk) queryParams.adCampaignPk = params.adCampaignPk;
        if (params.adSetPk) queryParams.adSetPk = params.adSetPk;
        if (params.adPk) queryParams.adPk = params.adPk;
      } else {
        if (params.campaign) queryParams.campaign = params.campaign;
      }

      logger.info('Executing orders attribution query', {
        shopName,
        channel: params.channel,
        dateRange: `${params.startDate} to ${params.endDate}`,
        firstTimeCustomersOnly: params.firstTimeCustomersOnly,
        filters: isAdSpend
          ? { adCampaignPk: params.adCampaignPk, adSetPk: params.adSetPk, adPk: params.adPk }
          : { campaign: params.campaign },
      });

      const client = clickhouseConnection.getClient();
      const resultSet = await client.query({
        query,
        query_params: queryParams,
        format: 'JSONEachRow',
      });

      const orders: OrderInfo[] = await resultSet.json();

      logger.info('Orders attribution query completed', {
        ordersCount: orders.length,
        channel: params.channel,
      });

      return {
        success: true,
        result: {
          orders,
          total: orders.length,
        },
      };
    } catch (error) {
      logger.error('Error fetching orders attribution', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }
}
