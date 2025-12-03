import { clickhouseConnection } from '@/database/clickhouse/connection.js';
import { supabaseConnection } from '@/database/supabase/connection.js';
import logger from '@/config/logger.js';
import type {
  CohortAnalyticsQuery,
  CohortAnalyticsResponse,
  CohortRawRow,
  CohortData,
  CohortPeriodData,
} from '@/types/cohort-analytics.js';

export class CohortAnalyticsService {
  /**
   * Get cohort analysis with timezone-aware period calculations
   *
   * TIMEZONE HANDLING:
   * - Cohort assignment uses first_order_datetime_local from int_customer_first_purchase
   * - Order period calculations use pre-calculated local period fields (order_year_local, etc.)
   * - Ad spend period calculations use pre-calculated local period fields (ad_year_local, etc.)
   * - Ensures retention periods align with shop's local timezone
   * - Fixes critical issue where orders near midnight were assigned to wrong retention periods
   *
   * COHORT METRICS:
   * - Retention rates by period (week/month/quarter/year)
   * - Revenue by cohort and period
   * - CAC (Customer Acquisition Cost) per cohort
   * - LTV (Lifetime Value) calculations
   * - Contribution Margin Three (CM3): LTV - COGS - CAC
   *
   * @param params - Query parameters including shop_name, cohort_type, date range, and filters
   * @returns Cohort analysis data with retention and revenue metrics per cohort period
   */
  async getCohortAnalysis(params: CohortAnalyticsQuery['query']): Promise<CohortAnalyticsResponse> {
    const startTime = Date.now();

    try {
      // Set defaults
      const endDate = params.end_date || new Date().toISOString().split('T')[0];
      const maxPeriods = params.max_periods || this.getDefaultMaxPeriods(params.cohort_type);
      const filterProductId = params.filter_product_id || 0;
      const filterVariantId = params.filter_variant_id || 0;

      logger.info('Starting cohort analysis', {
        shop_name: params.shop_name,
        cohort_type: params.cohort_type,
        start_date: params.start_date,
        end_date: endDate,
        max_periods: maxPeriods,
        filter_product_id: filterProductId,
        filter_variant_id: filterVariantId,
      });

      // Fetch shop currency from Supabase
      let currency: string | undefined;
      try {
        const supabase = supabaseConnection.getServiceClient();
        const { data: shopData, error } = await supabase
          .from('shopify_shops')
          .select('currency')
          .eq('shop_name', params.shop_name)
          .single();

        if (!error && shopData) {
          currency = shopData.currency || undefined;
        }
      } catch (error) {
        logger.warn('Failed to fetch shop currency', { error, shop_name: params.shop_name });
      }

      const query = `
        WITH customer_orders AS (
          SELECT
            cfp.customer_id,
            cfp.customer_email,
            cfp.shopify_shop,
            cfp.cohort_year,
            cfp.cohort_month,
            cfp.cohort_quarter,
            cfp.cohort_week,
            cfp.first_order_datetime_local as cohort_date,
            o.order_id,
            o.order_timestamp_local as order_date,
            o.total_price,
            o.total_tax,
            o.total_refund_amount,
            o.net_revenue,
            o.total_cogs,
            -- Use pre-calculated period fields in local timezone
            o.order_year_local as order_year,
            o.order_month_local as order_month,
            o.order_quarter_local as order_quarter,
            o.order_week_local as order_week
          FROM venon.int_customer_first_purchase cfp
          INNER JOIN venon.int_order_enriched o
            ON cfp.customer_email = o.customer_email
            AND cfp.shopify_shop = o.shopify_shop
          WHERE cfp.shopify_shop = {shop_name:String}
            AND toDate(cfp.first_order_datetime_local) >= {start_date:String}
            AND toDate(cfp.first_order_datetime_local) <= {end_date:String}
            -- Filter by customers who ordered specific product/variant in their first order
            AND (
              {filter_product_id:Int64} = 0 
              OR cfp.customer_id IN (
                SELECT DISTINCT customer_id 
                FROM venon.int_customer_first_order_line_items 
                WHERE shopify_product_id = {filter_product_id:Int64}
              )
            )
            AND (
              {filter_variant_id:Int64} = 0 
              OR cfp.customer_id IN (
                SELECT DISTINCT customer_id 
                FROM venon.int_customer_first_order_line_items 
                WHERE variant_id = {filter_variant_id:Int64}
              )
            )
        ),
        -- Calculate periods since acquisition for each order
        orders_with_periods AS (
          SELECT
            *,
            -- Calculate periods since first purchase based on cohort_type
            CASE {cohort_type:String}
              WHEN 'week' THEN (order_year - cohort_year) * 52 + (order_week - cohort_week)
              WHEN 'month' THEN (order_year - cohort_year) * 12 + (order_month - cohort_month)
              WHEN 'quarter' THEN (order_year - cohort_year) * 4 + (order_quarter - cohort_quarter)
              WHEN 'year' THEN order_year - cohort_year
            END as periods_since_acquisition
          FROM customer_orders
        ),
        -- Count active customers by cohort and period
        cohort_activity AS (
          SELECT
            shopify_shop,
            cohort_year,
            CASE {cohort_type:String}
              WHEN 'week' THEN cohort_week
              WHEN 'month' THEN cohort_month
              WHEN 'quarter' THEN cohort_quarter
              WHEN 'year' THEN 1  -- Year doesn't need a sub-period
            END as cohort_period,
            periods_since_acquisition,
            COUNT(DISTINCT customer_id) as active_customers,
            COUNT(order_id) as orders,
            SUM(total_price) as revenue,
            SUM(net_revenue) as net_revenue,
            SUM(total_cogs) as total_cogs
          FROM orders_with_periods
          WHERE periods_since_acquisition >= 0
            AND periods_since_acquisition <= {max_periods:UInt32}
          GROUP BY shopify_shop, cohort_year, cohort_period, periods_since_acquisition
        ),
        -- Get total customers per cohort (period 0)
        cohort_sizes AS (
          SELECT
            shopify_shop,
            cohort_year,
            cohort_period,
            active_customers as cohort_size
          FROM cohort_activity
          WHERE periods_since_acquisition = 0
        ),
        -- Get ad spend for each cohort's acquisition period
        cohort_ad_spend AS (
          SELECT
            shop_name as shopify_shop,
            ad_year_local as year,
            CASE {cohort_type:String}
              WHEN 'week' THEN ad_week_local
              WHEN 'month' THEN ad_month_local
              WHEN 'quarter' THEN ad_quarter_local
              WHEN 'year' THEN 1  -- Year doesn't need a sub-period
            END as period,
            SUM(spend) as total_ad_spend,
            SUM(clicks) as total_clicks,
            SUM(impressions) as total_impressions
          FROM venon.int_ad_spend
          WHERE shop_name = {shop_name:String}
            AND toDate(date_time) >= {start_date:String}
            AND toDate(date_time) <= {end_date:String}
          GROUP BY shop_name, year, period
        ),
        -- Add CAC to cohort sizes
        cohort_metrics AS (
          SELECT
            cs.*,
            COALESCE(cas.total_ad_spend, 0) as cohort_ad_spend,
            COALESCE(cas.total_ad_spend, 0) / NULLIF(cs.cohort_size, 0) as cac_per_customer,
            COALESCE(cas.total_clicks, 0) as cohort_clicks,
            COALESCE(cas.total_impressions, 0) as cohort_impressions
          FROM cohort_sizes cs
          LEFT JOIN cohort_ad_spend cas
            ON cs.shopify_shop = cas.shopify_shop
            AND cs.cohort_year = cas.year
            AND cs.cohort_period = cas.period
        ),
        -- Calculate retention rates
        retention_matrix AS (
          SELECT
            ca.shopify_shop,
            ca.cohort_year,
            ca.cohort_period,
            CASE {cohort_type:String}
              WHEN 'week' THEN toMonday(toDate(concat(toString(ca.cohort_year), '-01-01')) + (ca.cohort_period - 1) * 7)
              WHEN 'month' THEN toDate(concat(toString(ca.cohort_year), '-', leftPad(toString(ca.cohort_period), 2, '0'), '-01'))
              WHEN 'quarter' THEN toDate(concat(toString(ca.cohort_year), '-', leftPad(toString((ca.cohort_period - 1) * 3 + 1), 2, '0'), '-01'))
              WHEN 'year' THEN toDate(concat(toString(ca.cohort_year), '-01-01'))
            END as cohort_date,
            cm.cohort_size,
            cm.cohort_ad_spend,
            cm.cac_per_customer,
            ca.periods_since_acquisition,
            ca.active_customers,
            ca.orders,
            ca.revenue,
            ca.net_revenue,
            ca.total_cogs,
            ca.net_revenue - ca.total_cogs as contribution_margin_one,
            -- Ad spend allocation (only in period 0)
            CASE 
              WHEN ca.periods_since_acquisition = 0 THEN cm.cohort_ad_spend
              ELSE 0
            END as ad_spend_allocated,
            -- Contribution margin three (CM1 - ad spend)
            (ca.net_revenue - ca.total_cogs) - CASE 
              WHEN ca.periods_since_acquisition = 0 THEN cm.cohort_ad_spend
              ELSE 0
            END as contribution_margin_three,
            -- Calculate retention rate
            ca.active_customers * 100.0 / cm.cohort_size as retention_rate,
            -- Calculate average order value
            ca.revenue / NULLIF(ca.orders, 0) as avg_order_value,
            -- Calculate orders per active customer
            ca.orders * 1.0 / NULLIF(ca.active_customers, 0) as orders_per_customer
          FROM cohort_activity ca
          INNER JOIN cohort_metrics cm
            ON ca.shopify_shop = cm.shopify_shop
            AND ca.cohort_year = cm.cohort_year
            AND ca.cohort_period = cm.cohort_period
        )
        -- Final output with pivot-ready format
        SELECT 
          shopify_shop,
          formatDateTime(cohort_date, '%Y-%m-%d') as cohort,
          cohort_size,
          cohort_ad_spend,
          round(cac_per_customer, 2) as cac_per_customer,
          periods_since_acquisition as period,
          active_customers,
          retention_rate,
          orders,
          revenue,
          net_revenue,
          total_cogs,
          contribution_margin_one,
          avg_order_value,
          orders_per_customer,
          -- Contribution margin one metrics
          contribution_margin_one / NULLIF(active_customers, 0) as contribution_margin_one_per_customer,
          SUM(contribution_margin_one) OVER (
            PARTITION BY shopify_shop, cohort_year, cohort_period 
            ORDER BY periods_since_acquisition
          ) / cohort_size as cumulative_contribution_margin_one_per_customer,
          -- Ad spend and contribution margin three metrics
          ad_spend_allocated,
          contribution_margin_three,
          contribution_margin_three / NULLIF(active_customers, 0) as contribution_margin_three_per_customer,
          SUM(contribution_margin_three) OVER (
            PARTITION BY shopify_shop, cohort_year, cohort_period 
            ORDER BY periods_since_acquisition
          ) as cumulative_contribution_margin_three,
          SUM(contribution_margin_three) OVER (
            PARTITION BY shopify_shop, cohort_year, cohort_period 
            ORDER BY periods_since_acquisition
          ) / cohort_size as cumulative_contribution_margin_three_per_customer,
          -- Cumulative metrics
          SUM(revenue) OVER (
            PARTITION BY shopify_shop, cohort_year, cohort_period 
            ORDER BY periods_since_acquisition
          ) as cumulative_revenue,
          SUM(net_revenue) OVER (
            PARTITION BY shopify_shop, cohort_year, cohort_period 
            ORDER BY periods_since_acquisition
          ) as cumulative_net_revenue,
          SUM(revenue) OVER (
            PARTITION BY shopify_shop, cohort_year, cohort_period 
            ORDER BY periods_since_acquisition
          ) / cohort_size as ltv_to_date,
          SUM(net_revenue) OVER (
            PARTITION BY shopify_shop, cohort_year, cohort_period 
            ORDER BY periods_since_acquisition
          ) / cohort_size as net_ltv_to_date,
          -- LTV to CAC ratio
          round((SUM(revenue) OVER (
            PARTITION BY shopify_shop, cohort_year, cohort_period 
            ORDER BY periods_since_acquisition
          ) / cohort_size) / NULLIF(cac_per_customer, 0), 2) as ltv_to_cac_ratio,
          -- Net LTV to CAC ratio
          round((SUM(net_revenue) OVER (
            PARTITION BY shopify_shop, cohort_year, cohort_period 
            ORDER BY periods_since_acquisition
          ) / cohort_size) / NULLIF(cac_per_customer, 0), 2) as net_ltv_to_cac_ratio,
          -- Payback status
          CASE 
            WHEN (SUM(revenue) OVER (
              PARTITION BY shopify_shop, cohort_year, cohort_period 
              ORDER BY periods_since_acquisition
            ) / cohort_size) >= cac_per_customer 
            THEN 1 
            ELSE 0 
          END as is_payback_achieved
        FROM retention_matrix
        ORDER BY cohort_date ASC, periods_since_acquisition
      `;

      const rows = await clickhouseConnection.query<CohortRawRow>(query, {
        shop_name: params.shop_name,
        cohort_type: params.cohort_type,
        start_date: params.start_date,
        end_date: endDate,
        max_periods: maxPeriods,
        filter_product_id: filterProductId,
        filter_variant_id: filterVariantId,
      });

      const processedData = this.processRawData(rows);
      const elapsedMs = Date.now() - startTime;

      logger.info('Cohort analysis completed', {
        shop_name: params.shop_name,
        cohorts_count: processedData.length,
        elapsed_ms: elapsedMs,
      });

      return {
        data: {
          cohorts: processedData,
        },
        metadata: {
          shop_name: params.shop_name,
          cohort_type: params.cohort_type,
          start_date: params.start_date,
          end_date: endDate,
          max_periods: maxPeriods,
          ...(filterProductId > 0 && { filter_product_id: filterProductId }),
          ...(filterVariantId > 0 && { filter_variant_id: filterVariantId }),
          query_timestamp: new Date().toISOString(),
          ...(currency && { currency }),
        },
      };
    } catch (error) {
      logger.error('Error in cohort analysis service', {
        error: error instanceof Error ? error.message : 'Unknown error',
        params,
      });
      throw error;
    }
  }

  private getDefaultMaxPeriods(cohortType: string): number {
    switch (cohortType) {
      case 'week':
        return 52; // 1 year
      case 'month':
        return 12; // 1 year
      case 'quarter':
        return 4; // 1 year
      case 'year':
        return 2; // Limit to 2 years for performance (UI would be cluttered with 10+ years of data)
      default:
        return 52;
    }
  }

  private processRawData(rows: CohortRawRow[]): CohortData[] {
    const cohortMap = new Map<string, CohortData>();

    for (const row of rows) {
      const cohortKey = row.cohort;

      if (!cohortMap.has(cohortKey)) {
        cohortMap.set(cohortKey, {
          cohort: row.cohort,
          cohort_size: parseInt(row.cohort_size),
          cohort_ad_spend: parseFloat(row.cohort_ad_spend),
          cac_per_customer: parseFloat(row.cac_per_customer),
          periods: [],
        });
      }

      const cohort = cohortMap.get(cohortKey)!;

      const period: CohortPeriodData = {
        period: parseInt(row.period),
        metrics: {
          incremental: {
            active_customers: parseInt(row.active_customers),
            active_customers_percentage: parseFloat(row.retention_rate),
            orders: parseInt(row.orders),
            net_revenue: parseFloat(row.net_revenue),
            contribution_margin_one: parseFloat(row.contribution_margin_one_per_customer || '0'),
            contribution_margin_three: parseFloat(
              row.contribution_margin_three_per_customer || '0'
            ),
            average_order_value: parseFloat(row.avg_order_value || '0'),
          },
          cumulative: {
            active_customers: parseInt(row.active_customers), // For cumulative, we'll need to sum these up
            active_customers_percentage: parseFloat(row.retention_rate),
            orders: parseInt(row.cumulative_revenue) ? parseInt(row.orders) : 0, // Placeholder, will be calculated
            net_revenue: parseFloat(row.cumulative_net_revenue),
            contribution_margin_one: parseFloat(
              row.cumulative_contribution_margin_one_per_customer || '0'
            ),
            contribution_margin_three: parseFloat(
              row.cumulative_contribution_margin_three_per_customer || '0'
            ),
            average_order_value: parseFloat(row.avg_order_value || '0'),
            ltv_to_date: parseFloat(row.ltv_to_date),
            net_ltv_to_date: parseFloat(row.net_ltv_to_date),
            ltv_to_cac_ratio: parseFloat(row.ltv_to_cac_ratio),
            net_ltv_to_cac_ratio: parseFloat(row.net_ltv_to_cac_ratio),
            // Check payback achieved - fallback to calculating from ltv_to_cac_ratio if needed
            is_payback_achieved:
              row.is_payback_achieved === '1' || parseFloat(row.ltv_to_cac_ratio) >= 1,
            cumulative_contribution_margin_three_per_customer: parseFloat(
              row.cumulative_contribution_margin_three_per_customer
            ),
          },
        },
      };

      cohort.periods.push(period);
    }

    // Calculate cumulative orders for each cohort
    for (const cohort of cohortMap.values()) {
      cohort.periods.sort((a, b) => a.period - b.period);

      let cumulativeOrders = 0;

      for (let i = 0; i < cohort.periods.length; i++) {
        const period = cohort.periods[i];
        if (!period) continue;

        cumulativeOrders += period.metrics.incremental.orders;
        period.metrics.cumulative.orders = cumulativeOrders;

        // For cumulative active customers, we need to track unique customers
        // This is a simplification - in reality we'd need customer-level data
        if (i === 0) {
          period.metrics.cumulative.active_customers = period.metrics.incremental.active_customers;
        } else {
          const prevPeriod = cohort.periods[i - 1];
          if (prevPeriod) {
            // Use the max of previous cumulative and current incremental as an approximation
            period.metrics.cumulative.active_customers = Math.max(
              prevPeriod.metrics.cumulative.active_customers,
              period.metrics.incremental.active_customers
            );
          }
        }
      }
    }

    return Array.from(cohortMap.values()).sort((a, b) => a.cohort.localeCompare(b.cohort));
  }
}
