import { z } from 'zod';

// Request schema for non-ad-spend analytics
export const nonAdSpendAnalyticsRequestSchema = z.object({
  accountId: z.string(),
  channel: z.string(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  attributionModel: z.enum([
    'first_click',
    'last_click',
    'last_paid_click',
    'linear_all',
    'linear_paid',
    'all_clicks',
  ]),
  attributionWindow: z.enum(['1_day', '7_day', '14_day', '28_day', '90_day', 'lifetime']),
});

export type NonAdSpendAnalyticsRequest = z.infer<typeof nonAdSpendAnalyticsRequestSchema>;

// Response types
export interface NonAdSpendCampaign {
  channel: string;
  campaign: string | null;
  attributed_orders: number;
  attributed_revenue: number;
  distinct_orders_touched: number;
  attributed_cogs: number;
  attributed_payment_fees: number;
  attributed_tax: number;
  gross_revenue: number;
  net_profit: number;
  profit_margin_pct: number;
  avg_order_value: number;
  revenue_per_order_touched: number;
  first_time_customer_orders: number;
  first_time_customer_revenue: number;
}

export interface NonAdSpendAnalyticsResponse {
  success: boolean;
  result: {
    data: NonAdSpendCampaign[];
    metadata: {
      shop_name: string;
      channel: string;
      start_date: string;
      end_date: string;
      attribution_model: string;
      attribution_window: string;
      query_timestamp: string;
    };
  };
}
