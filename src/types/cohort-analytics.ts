import { z } from 'zod';

// Request validation schemas
export const cohortAnalyticsQuerySchema = z.object({
  query: z.object({
    shop_name: z.string().min(1, 'Shop name is required'),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format')
      .optional(),
    cohort_type: z.enum(['week', 'month', 'quarter', 'year']),
    max_periods: z.number().int().positive().optional(),
    filter_product_id: z.coerce.number().int().optional(),
    filter_variant_id: z.coerce.number().int().optional(),
    metrics: z
      .array(
        z.enum([
          'active_customers',
          'active_customers_percentage',
          'net_revenue',
          'contribution_margin_one',
          'contribution_margin_three',
          'orders',
          'average_order_value',
        ])
      )
      .optional(),
  }),
});

export type CohortAnalyticsQuery = z.infer<typeof cohortAnalyticsQuerySchema>;

// Response types
export interface CohortMetrics {
  active_customers: number;
  active_customers_percentage: number;
  orders: number;
  net_revenue: number;
  contribution_margin_one: number;
  contribution_margin_three: number;
  average_order_value: number;
}

export interface CumulativeMetrics extends CohortMetrics {
  ltv_to_date: number;
  net_ltv_to_date: number;
  ltv_to_cac_ratio: number;
  net_ltv_to_cac_ratio: number;
  is_payback_achieved: boolean;
  cumulative_contribution_margin_three_per_customer: number;
}

export interface CohortPeriodData {
  period: number;
  metrics: {
    incremental: CohortMetrics;
    cumulative: CumulativeMetrics;
  };
}

export interface CohortData {
  cohort: string; // Date string YYYY-MM-DD
  cohort_size: number;
  cohort_ad_spend: number;
  cac_per_customer: number;
  periods: CohortPeriodData[];
}

export interface CohortAnalyticsResponse {
  data: {
    cohorts: CohortData[];
  };
  metadata: {
    shop_name: string;
    cohort_type: string;
    start_date: string;
    end_date?: string;
    max_periods: number;
    filter_product_id?: number;
    filter_variant_id?: number;
    query_timestamp: string;
    currency?: string;
  };
}

// Internal ClickHouse result types
export interface CohortRawRow {
  shopify_shop: string;
  cohort: string;
  cohort_size: string;
  cohort_ad_spend: string;
  cac_per_customer: string;
  period: string;
  active_customers: string;
  retention_rate: string;
  orders: string;
  revenue: string;
  net_revenue: string;
  total_cogs: string;
  contribution_margin_one: string;
  avg_order_value: string;
  orders_per_customer: string;
  contribution_margin_one_per_customer: string;
  cumulative_contribution_margin_one_per_customer: string;
  ad_spend_allocated: string;
  contribution_margin_three: string;
  contribution_margin_three_per_customer: string;
  cumulative_contribution_margin_three: string;
  cumulative_contribution_margin_three_per_customer: string;
  cumulative_revenue: string;
  cumulative_net_revenue: string;
  ltv_to_date: string;
  net_ltv_to_date: string;
  ltv_to_cac_ratio: string;
  net_ltv_to_cac_ratio: string;
  is_payback_achieved: string;
}
