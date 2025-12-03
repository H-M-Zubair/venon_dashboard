/**
 * Event-Based Timeseries Service
 *
 * Provides time-aggregated (hourly/daily) ROAS, ad spend, and attributed revenue
 * using event-based attribution (int_event_metadata table with event timestamps).
 *
 * Unlike order-based timeseries which uses pre-calculated tables and attribution windows,
 * this service queries raw event data and filters by event timestamps and position flags.
 */

import { clickhouseConnection } from '@/database/clickhouse/connection.js';
import logger from '@/config/logger.js';
import type {
  EventBasedTimeseriesQuery,
  TimeseriesResponse,
  TimeseriesDataPoint,
  TimeseriesFilter,
} from '@/types/timeseries.js';
import { getShopNameFromAccountId } from '@/utils/account-helpers.js';
import {
  validateDateRange,
  shouldUseHourlyAggregation,
  makeEndDateInclusiveAndFormat,
} from '@/utils/date-helpers.js';

export class EventBasedTimeseriesService {
  /**
   * Get event-based timeseries data
   * Aggregates metrics by time period (hourly or daily)
   */
  async getEventBasedTimeseries(
    accountId: string,
    params: EventBasedTimeseriesQuery['query']
  ): Promise<TimeseriesResponse> {
    const startTime = Date.now();

    try {
      // Get shop name from account ID
      const actualShopName = await getShopNameFromAccountId(accountId);

      logger.info('Resolved shop name from account for event-based timeseries', {
        accountId,
        actualShopName,
        filter: params.filter,
      });

      // Validate and prepare date range
      const startDate = new Date(params.start_date);
      const endDate = new Date(params.end_date);
      validateDateRange(startDate, endDate);

      // Determine if we should use hourly or daily aggregation
      const isHourly = shouldUseHourlyAggregation(startDate, endDate);

      // Make end date inclusive for query
      const endDateStr = makeEndDateInclusiveAndFormat(endDate);

      let query: string;
      let queryParams: Record<string, any>;

      // Build query based on filter type
      if (!params.filter || params.filter.type === 'all_channels') {
        query = this.buildAllChannelsQuery(isHourly, params.attribution_model);
        queryParams = {
          shop_name: actualShopName,
          start_date: params.start_date,
          end_date: endDateStr,
        };
      } else if (params.filter.type === 'channel') {
        query = this.buildSingleChannelQuery(isHourly, params.attribution_model);
        queryParams = {
          shop_name: actualShopName,
          start_date: params.start_date,
          end_date: endDateStr,
          channel: params.filter.channel,
        };
      } else if (params.filter.type === 'ad_hierarchy') {
        query = this.buildAdHierarchyQuery(isHourly, params.filter, params.attribution_model);
        queryParams = {
          shop_name: actualShopName,
          start_date: params.start_date,
          end_date: endDateStr,
          channel: params.filter.channel,
          ...(params.filter.ad_campaign_pk && { ad_campaign_pk: params.filter.ad_campaign_pk }),
          ...(params.filter.ad_set_pk && { ad_set_pk: params.filter.ad_set_pk }),
          ...(params.filter.ad_pk && { ad_pk: params.filter.ad_pk }),
        };
      } else {
        throw new Error('Invalid filter type');
      }

      logger.info('Executing event-based timeseries query', {
        accountId,
        aggregationLevel: isHourly ? 'hourly' : 'daily',
        filterType: params.filter?.type || 'all_channels',
        attributionModel: params.attribution_model,
        params: queryParams,
      });

      const results = await clickhouseConnection.query<TimeseriesDataPoint>(query, queryParams);

      const response: TimeseriesResponse = {
        data: {
          timeseries: results.map((row) => ({
            time_period: row.time_period,
            total_ad_spend: Number(row.total_ad_spend),
            total_attributed_revenue: Number(row.total_attributed_revenue),
            roas: Number(row.roas),
          })),
          aggregation_level: isHourly ? 'hourly' : 'daily',
        },
        metadata: {
          shop_name: actualShopName,
          start_date: params.start_date,
          end_date: params.end_date,
          attribution_model: params.attribution_model,
          attribution_window: 'lifetime', // Event-based is always lifetime
          filter: params.filter || { type: 'all_channels' },
          query_timestamp: new Date().toISOString(),
        },
      };

      const executionTime = Date.now() - startTime;
      logger.info('Event-based timeseries query completed', {
        accountId,
        executionTimeMs: executionTime,
        resultCount: results.length,
        aggregationLevel: response.data.aggregation_level,
      });

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error('Event-based timeseries query failed', {
        accountId,
        params,
        executionTimeMs: executionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Build query for all channels aggregated
   * Uses event_timestamp and attribution model flags
   */
  private buildAllChannelsQuery(isHourly: boolean, attributionModel: string): string {
    const timeFunction = isHourly ? 'toStartOfHour' : 'toDate';
    const attributionFilter = this.getAttributionFilter(attributionModel);

    return `
      SELECT
        time_period,
        SUM(ad_spend) AS total_ad_spend,
        SUM(attributed_revenue) AS total_attributed_revenue,
        CASE
          WHEN SUM(ad_spend) > 0
          THEN SUM(attributed_revenue) / SUM(ad_spend)
          ELSE 0
        END AS roas
      FROM (
        SELECT
          ${timeFunction}(event_timestamp) AS time_period,
          0 AS ad_spend,
          SUM(total_price) AS attributed_revenue
        FROM int_event_metadata
        WHERE shopify_shop = {shop_name:String}
          AND event_timestamp >= {start_date:String}
          AND event_timestamp < {end_date:String}
          AND ${attributionFilter}
        GROUP BY time_period

        UNION ALL

        SELECT
          ${timeFunction}(date_time) AS time_period,
          SUM(spend) AS ad_spend,
          0 AS attributed_revenue
        FROM int_ad_spend
        WHERE shop_name = {shop_name:String}
          AND date_time >= {start_date:String}
          AND date_time < {end_date:String}
        GROUP BY time_period
      ) AS combined_data
      GROUP BY time_period
      ORDER BY time_period ASC
    `.trim();
  }

  /**
   * Build query for a single channel
   * Filters events by channel in addition to attribution filter
   */
  private buildSingleChannelQuery(isHourly: boolean, attributionModel: string): string {
    const timeFunction = isHourly ? 'toStartOfHour' : 'toDate';
    const attributionFilter = this.getAttributionFilter(attributionModel);

    return `
      SELECT
        time_period,
        SUM(ad_spend) AS total_ad_spend,
        SUM(attributed_revenue) AS total_attributed_revenue,
        CASE
          WHEN SUM(ad_spend) > 0
          THEN SUM(attributed_revenue) / SUM(ad_spend)
          ELSE 0
        END AS roas
      FROM (
        SELECT
          ${timeFunction}(event_timestamp) AS time_period,
          0 AS ad_spend,
          SUM(total_price) AS attributed_revenue
        FROM int_event_metadata
        WHERE shopify_shop = {shop_name:String}
          AND event_timestamp >= {start_date:String}
          AND event_timestamp < {end_date:String}
          AND channel = {channel:String}
          AND ${attributionFilter}
        GROUP BY time_period

        UNION ALL

        SELECT
          ${timeFunction}(date_time) AS time_period,
          SUM(spend) AS ad_spend,
          0 AS attributed_revenue
        FROM int_ad_spend
        WHERE shop_name = {shop_name:String}
          AND date_time >= {start_date:String}
          AND date_time < {end_date:String}
          AND channel = {channel:String}
        GROUP BY time_period
      ) AS combined_data
      GROUP BY time_period
      ORDER BY time_period ASC
    `.trim();
  }

  /**
   * Build query for ad hierarchy filtering
   * Filters by channel and optionally by campaign/adset/ad PKs
   */
  private buildAdHierarchyQuery(
    isHourly: boolean,
    filter: TimeseriesFilter,
    attributionModel: string
  ): string {
    const timeFunction = isHourly ? 'toStartOfHour' : 'toDate';
    const attributionFilter = this.getAttributionFilter(attributionModel);

    // Build WHERE conditions based on filter
    let eventWhereConditions = `
      shopify_shop = {shop_name:String}
      AND event_timestamp >= {start_date:String}
      AND event_timestamp < {end_date:String}
      AND channel = {channel:String}
      AND ${attributionFilter}
    `;

    let adSpendWhereConditions = `
      shop_name = {shop_name:String}
      AND date_time >= {start_date:String}
      AND date_time < {end_date:String}
      AND channel = {channel:String}
    `;

    // Add hierarchy filters
    if (filter.type === 'ad_hierarchy') {
      if (filter.ad_campaign_pk) {
        eventWhereConditions += ' AND ad_campaign_pk = {ad_campaign_pk:UInt64}';
        adSpendWhereConditions += ' AND ad_campaign_pk = {ad_campaign_pk:UInt64}';
      }
      if (filter.ad_set_pk) {
        eventWhereConditions += ' AND ad_set_pk = {ad_set_pk:UInt64}';
        adSpendWhereConditions += ' AND ad_set_pk = {ad_set_pk:UInt64}';
      }
      if (filter.ad_pk) {
        eventWhereConditions += ' AND ad_pk = {ad_pk:UInt64}';
        adSpendWhereConditions += ' AND ad_pk = {ad_pk:UInt64}';
      }
    }

    return `
      SELECT
        time_period,
        SUM(ad_spend) AS total_ad_spend,
        SUM(attributed_revenue) AS total_attributed_revenue,
        CASE
          WHEN SUM(ad_spend) > 0
          THEN SUM(attributed_revenue) / SUM(ad_spend)
          ELSE 0
        END AS roas
      FROM (
        SELECT
          ${timeFunction}(event_timestamp) AS time_period,
          0 AS ad_spend,
          SUM(total_price) AS attributed_revenue
        FROM int_event_metadata
        WHERE ${eventWhereConditions}
        GROUP BY time_period

        UNION ALL

        SELECT
          ${timeFunction}(date_time) AS time_period,
          SUM(spend) AS ad_spend,
          0 AS attributed_revenue
        FROM int_ad_spend
        WHERE ${adSpendWhereConditions}
        GROUP BY time_period
      ) AS combined_data
      GROUP BY time_period
      ORDER BY time_period ASC
    `.trim();
  }

  /**
   * Get the attribution filter clause for a specific model
   * Different models use different event position flags in int_event_metadata
   */
  private getAttributionFilter(model: string): string {
    switch (model) {
      case 'first_click':
        return 'is_first_event_overall = TRUE';

      case 'last_click':
        return 'is_last_event_overall = TRUE';

      case 'last_paid_click':
        return `(is_last_paid_event_overall = TRUE AND has_any_paid_events = TRUE)
                OR (is_last_event_overall = TRUE AND has_any_paid_events = FALSE)`;

      case 'linear_all':
        // No filter - all events in the date range contribute
        return 'TRUE';

      case 'linear_paid':
        // Paid events + fallback to all events for orders with no paid events
        return `is_paid_channel = TRUE
                OR order_id NOT IN (
                  SELECT DISTINCT order_id
                  FROM int_event_metadata
                  WHERE shopify_shop = {shop_name:String}
                    AND event_timestamp >= {start_date:String}
                    AND event_timestamp < {end_date:String}
                    AND is_paid_channel = TRUE
                )`;

      default:
        throw new Error(`Unknown attribution model: ${model}`);
    }
  }
}
