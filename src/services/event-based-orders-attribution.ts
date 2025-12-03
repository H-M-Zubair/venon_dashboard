/**
 * Event-Based Orders Attribution Service
 *
 * Returns the list of orders that qualify for attribution based on event timestamps.
 * Unlike order-based attribution which uses pre-calculated tables and attribution windows,
 * this service queries the int_event_metadata table directly using event position flags.
 */

import { clickhouseConnection } from '@/database/clickhouse/connection.js';
import {
  EventBasedOrdersAttributionRequest,
  OrderInfo,
  OrdersAttributionResponse,
} from '@/types/orders-attribution.js';
import logger from '@/config/logger.js';
import { isAdSpendChannel } from '@/config/channels.js';
import { getShopNameFromAccountId } from '@/utils/account-helpers.js';
import { makeEndDateInclusiveAndFormat } from '@/utils/date-helpers.js';

export class EventBasedOrdersAttributionService {
  /**
   * Get orders that qualify for attribution based on event timestamps
   * Different attribution models use different event position flags
   */
  async getOrdersForEventAttribution(
    params: EventBasedOrdersAttributionRequest
  ): Promise<OrdersAttributionResponse> {
    try {
      // Get shop name from account ID
      const shopName = await getShopNameFromAccountId(params.accountId);

      // Make end date inclusive for query
      const endDateStr = makeEndDateInclusiveAndFormat(new Date(params.endDate));

      // Determine if this is an ad-spend channel
      const isAdSpend = isAdSpendChannel(params.channel);

      // Build optional filter conditions
      const optionalFilters = this.buildOptionalFilterConditions(params, isAdSpend);

      // Build query based on attribution model
      const query = this.buildQueryForModel(params.attributionModel, optionalFilters);

      // Build query parameters
      const queryParams: Record<string, any> = {
        shopName,
        startDate: params.startDate,
        endDate: endDateStr,
        channel: params.channel,
      };

      // Add optional filter parameters
      if (isAdSpend) {
        if (params.adCampaignPk) queryParams.adCampaignPk = params.adCampaignPk;
        if (params.adSetPk) queryParams.adSetPk = params.adSetPk;
        if (params.adPk) queryParams.adPk = params.adPk;
      } else {
        if (params.campaign) queryParams.campaign = params.campaign;
      }

      logger.info('Executing event-based orders attribution query', {
        shopName,
        channel: params.channel,
        model: params.attributionModel,
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

      // Apply first-time customers filter if requested
      // We do this in application code for simplicity and consistency
      // ClickHouse returns boolean as 0/1, so we check for truthy values
      const filteredOrders = params.firstTimeCustomersOnly
        ? orders.filter((order) => !!order.is_first_customer_order)
        : orders;

      logger.info('Event-based orders attribution query completed', {
        ordersCount: filteredOrders.length,
        channel: params.channel,
        model: params.attributionModel,
      });

      return {
        success: true,
        result: {
          orders: filteredOrders,
          total: filteredOrders.length,
        },
      };
    } catch (error) {
      logger.error('Error fetching event-based orders attribution', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Build the SQL query for a specific attribution model
   */
  private buildQueryForModel(
    model: EventBasedOrdersAttributionRequest['attributionModel'],
    optionalFilters: string
  ): string {
    switch (model) {
      case 'first_click':
        return this.buildFirstClickQuery(optionalFilters);
      case 'last_click':
        return this.buildLastClickQuery(optionalFilters);
      case 'last_paid_click':
        return this.buildLastPaidClickQuery(optionalFilters);
      case 'linear_all':
        return this.buildLinearAllQuery(optionalFilters);
      case 'linear_paid':
        return this.buildLinearPaidQuery(optionalFilters);
      default:
        throw new Error(`Unknown attribution model: ${model}`);
    }
  }

  /**
   * First Click: Orders where the FIRST event occurred in the date range
   */
  private buildFirstClickQuery(optionalFilters: string): string {

    return `
      SELECT DISTINCT
        order_id,
        order_number,
        order_timestamp,
        is_first_customer_order
      FROM int_event_metadata
      WHERE shopify_shop = {shopName: String}
        AND event_timestamp >= {startDate: String}
        AND event_timestamp < {endDate: String}
        AND channel = {channel: String}
        AND is_first_event_overall = TRUE
        ${optionalFilters}
      ORDER BY order_timestamp DESC, order_id
    `.trim();
  }

  /**
   * Last Click: Orders where the LAST event occurred in the date range
   */
  private buildLastClickQuery(optionalFilters: string): string {
    return `
      SELECT DISTINCT
        order_id,
        order_number,
        order_timestamp,
        is_first_customer_order
      FROM int_event_metadata
      WHERE shopify_shop = {shopName: String}
        AND event_timestamp >= {startDate: String}
        AND event_timestamp < {endDate: String}
        AND channel = {channel: String}
        AND is_last_event_overall = TRUE
        ${optionalFilters}
      ORDER BY order_timestamp DESC, order_id
    `.trim();
  }

  /**
   * Last Paid Click: Orders where the LAST PAID event occurred in the date range
   * Fallback to last event if order has no paid events
   */
  private buildLastPaidClickQuery(optionalFilters: string): string {
    return `
      SELECT DISTINCT
        order_id,
        order_number,
        order_timestamp,
        is_first_customer_order
      FROM int_event_metadata
      WHERE shopify_shop = {shopName: String}
        AND event_timestamp >= {startDate: String}
        AND event_timestamp < {endDate: String}
        AND channel = {channel: String}
        AND (
          (is_last_paid_event_overall = TRUE AND has_any_paid_events = TRUE)
          OR (is_last_event_overall = TRUE AND has_any_paid_events = FALSE)
        )
        ${optionalFilters}
      ORDER BY order_timestamp DESC, order_id
    `.trim();
  }

  /**
   * Linear All: Orders with ANY events in the date range
   * All events contribute equally to attribution
   */
  private buildLinearAllQuery(optionalFilters: string): string {
    return `
      SELECT DISTINCT
        order_id,
        order_number,
        order_timestamp,
        is_first_customer_order
      FROM int_event_metadata
      WHERE shopify_shop = {shopName: String}
        AND event_timestamp >= {startDate: String}
        AND event_timestamp < {endDate: String}
        AND channel = {channel: String}
        ${optionalFilters}
      ORDER BY order_timestamp DESC, order_id
    `.trim();
  }

  /**
   * Linear Paid: Orders with PAID events in the date range
   * Fallback to all events for orders with no paid events in the range
   */
  private buildLinearPaidQuery(optionalFilters: string): string {
    return `
      SELECT DISTINCT
        order_id,
        order_number,
        order_timestamp,
        is_first_customer_order
      FROM int_event_metadata
      WHERE shopify_shop = {shopName: String}
        AND event_timestamp >= {startDate: String}
        AND event_timestamp < {endDate: String}
        AND channel = {channel: String}
        AND (
          is_paid_channel = TRUE
          OR order_id NOT IN (
            SELECT DISTINCT order_id
            FROM int_event_metadata
            WHERE shopify_shop = {shopName: String}
              AND event_timestamp >= {startDate: String}
              AND event_timestamp < {endDate: String}
              AND is_paid_channel = TRUE
          )
        )
        ${optionalFilters}
      ORDER BY order_timestamp DESC, order_id
    `.trim();
  }

  /**
   * Build optional filter conditions based on provided parameters
   */
  private buildOptionalFilterConditions(
    params: EventBasedOrdersAttributionRequest,
    isAdSpend: boolean
  ): string {
    const conditions: string[] = [];

    if (isAdSpend) {
      // For ad-spend channels, filter by ad campaign/set/ad PKs
      if (params.adCampaignPk) {
        conditions.push('AND ad_campaign_pk = {adCampaignPk: String}');
      }
      if (params.adSetPk) {
        conditions.push('AND ad_set_pk = {adSetPk: String}');
      }
      if (params.adPk) {
        conditions.push('AND ad_pk = {adPk: String}');
      }
    } else {
      // For non-ad-spend channels, filter by campaign name
      if (params.campaign) {
        conditions.push('AND campaign = {campaign: String}');
      }
    }

    return conditions.join('\n        ');
  }
}
