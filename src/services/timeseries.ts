import { clickhouseConnection } from '@/database/clickhouse/connection.js';
import logger from '@/config/logger.js';
import { getAttributionTableName } from '@/utils/attribution-tables.js';
import { getShopNameFromAccountId } from '@/utils/account-helpers.js';
import {
  validateDateRange,
  shouldUseHourlyAggregation,
  makeEndDateInclusiveAndFormat,
} from '@/utils/date-helpers.js';
import type {
  TimeseriesQuery,
  TimeseriesResponse,
  TimeseriesDataPoint,
  TimeseriesFilter,
} from '@/types/timeseries.js';

export class TimeseriesService {
  async getTimeseries(
    accountId: string,
    params: TimeseriesQuery['query']
  ): Promise<TimeseriesResponse> {
    const startTime = Date.now();

    try {
      // Get shop name from account ID
      const actualShopName = await getShopNameFromAccountId(accountId);
      logger.info('Resolved shop name from account for timeseries', {
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
          attribution_window: params.attribution_window,
        };
      } else if (params.filter.type === 'channel') {
        query = this.buildSingleChannelQuery(isHourly, params.attribution_model);
        queryParams = {
          shop_name: actualShopName,
          start_date: params.start_date,
          end_date: endDateStr,
          attribution_window: params.attribution_window,
          channel: params.filter.channel,
        };
      } else if (params.filter.type === 'ad_hierarchy') {
        query = this.buildAdHierarchyQuery(isHourly, params.filter, params.attribution_model);
        queryParams = {
          shop_name: actualShopName,
          start_date: params.start_date,
          end_date: endDateStr,
          attribution_window: params.attribution_window,
          channel: params.filter.channel,
          ...(params.filter.ad_campaign_pk && { ad_campaign_pk: params.filter.ad_campaign_pk }),
          ...(params.filter.ad_set_pk && { ad_set_pk: params.filter.ad_set_pk }),
          ...(params.filter.ad_pk && { ad_pk: params.filter.ad_pk }),
        };
      } else {
        throw new Error('Invalid filter type');
      }

      logger.info('Executing timeseries query', {
        accountId,
        aggregationLevel: isHourly ? 'hourly' : 'daily',
        filterType: params.filter?.type || 'all_channels',
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
          attribution_window: params.attribution_window,
          filter: params.filter || { type: 'all_channels' },
          query_timestamp: new Date().toISOString(),
        },
      };

      const executionTime = Date.now() - startTime;
      logger.info('Timeseries query completed', {
        accountId,
        executionTimeMs: executionTime,
        resultCount: results.length,
        aggregationLevel: response.data.aggregation_level,
      });

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error('Timeseries query failed', {
        accountId,
        params,
        executionTimeMs: executionTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private buildAllChannelsQuery(isHourly: boolean, attributionModel: string): string {
    const timeFunction = isHourly ? 'toStartOfHour' : 'toDate';
    const tableName = getAttributionTableName(attributionModel);

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
          ${timeFunction}(order_timestamp) AS time_period,
          0 AS ad_spend,
          SUM(attributed_revenue) AS attributed_revenue
        FROM ${tableName}
        WHERE shopify_shop = {shop_name:String}
          AND order_timestamp >= {start_date:String}
          AND order_timestamp < {end_date:String}
          AND attribution_window = {attribution_window:String}
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
    `;
  }

  private buildSingleChannelQuery(isHourly: boolean, attributionModel: string): string {
    const timeFunction = isHourly ? 'toStartOfHour' : 'toDate';
    const tableName = getAttributionTableName(attributionModel);

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
          ${timeFunction}(order_timestamp) AS time_period,
          0 AS ad_spend,
          SUM(attributed_revenue) AS attributed_revenue
        FROM ${tableName}
        WHERE shopify_shop = {shop_name:String}
          AND order_timestamp >= {start_date:String}
          AND order_timestamp < {end_date:String}
          AND attribution_window = {attribution_window:String}
          AND channel = {channel:String}
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
    `;
  }

  private buildAdHierarchyQuery(
    isHourly: boolean,
    filter: TimeseriesFilter,
    attributionModel: string
  ): string {
    const timeFunction = isHourly ? 'toStartOfHour' : 'toDate';
    const tableName = getAttributionTableName(attributionModel);

    // Build WHERE conditions based on filter
    let attributionWhereConditions = `
      shopify_shop = {shop_name:String}
      AND order_timestamp >= {start_date:String}
      AND order_timestamp < {end_date:String}
      AND attribution_window = {attribution_window:String}
      AND channel = {channel:String}
    `;

    let adSpendWhereConditions = `
      shop_name = {shop_name:String}
      AND date_time >= {start_date:String}
      AND date_time < {end_date:String}
      AND channel = {channel:String}
    `;

    // Add hierarchy filters - filter is guaranteed to be 'ad_hierarchy' type here
    if (filter.type === 'ad_hierarchy') {
      if (filter.ad_campaign_pk) {
        attributionWhereConditions += ' AND ad_campaign_pk = {ad_campaign_pk:UInt64}';
        adSpendWhereConditions += ' AND ad_campaign_pk = {ad_campaign_pk:UInt64}';
      }
      if (filter.ad_set_pk) {
        attributionWhereConditions += ' AND ad_set_pk = {ad_set_pk:UInt64}';
        adSpendWhereConditions += ' AND ad_set_pk = {ad_set_pk:UInt64}';
      }
      if (filter.ad_pk) {
        attributionWhereConditions += ' AND ad_pk = {ad_pk:UInt64}';
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
          ${timeFunction}(order_timestamp) AS time_period,
          0 AS ad_spend,
          SUM(attributed_revenue) AS attributed_revenue
        FROM ${tableName}
        WHERE ${attributionWhereConditions}
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
    `;
  }
}
