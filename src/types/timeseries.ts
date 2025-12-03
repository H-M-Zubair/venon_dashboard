import { z } from 'zod';

// Filter types for different query scenarios
export const timeseriesFilterSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('all_channels'),
  }),
  z.object({
    type: z.literal('channel'),
    channel: z.string().min(1, 'Channel is required'),
  }),
  z.object({
    type: z.literal('ad_hierarchy'),
    channel: z.string().min(1, 'Channel is required'),
    ad_campaign_pk: z.number().optional(),
    ad_set_pk: z.number().optional(),
    ad_pk: z.number().optional(),
  }),
]);

export type TimeseriesFilter = z.infer<typeof timeseriesFilterSchema>;

// Request validation schema
export const timeseriesQuerySchema = z.object({
  query: z.object({
    account_id: z.string().min(1, 'Account ID is required'),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
    attribution_model: z
      .enum([
        'linear_paid',
        'linear_all',
        'first_click',
        'last_click',
        'last_paid_click',
        'all_clicks',
      ])
      .default('last_paid_click'),
    attribution_window: z
      .enum(['1_day', '7_day', '14_day', '28_day', '90_day', 'lifetime'])
      .default('28_day'),
    filter: timeseriesFilterSchema.optional(),
  }),
});

export type TimeseriesQuery = z.infer<typeof timeseriesQuerySchema>;

/**
 * Event-based timeseries query schema
 * Similar to TimeseriesQuery but WITHOUT attribution_window parameter
 * Event-based attribution is always lifetime (uses event_timestamp filtering only)
 */
export const eventBasedTimeseriesQuerySchema = z.object({
  query: z.object({
    account_id: z.string().min(1, 'Account ID is required'),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
    attribution_model: z
      .enum(['first_click', 'last_click', 'last_paid_click', 'linear_all', 'linear_paid'])
      .default('last_click'),
    filter: timeseriesFilterSchema.optional(),
  }),
});

export type EventBasedTimeseriesQuery = z.infer<typeof eventBasedTimeseriesQuerySchema>;

// Response types (reused for both order-based and event-based)
export interface TimeseriesDataPoint {
  time_period: string;
  total_ad_spend: number;
  total_attributed_revenue: number;
  roas: number;
}

export interface TimeseriesResponse {
  data: {
    timeseries: TimeseriesDataPoint[];
    aggregation_level: 'hourly' | 'daily';
  };
  metadata: {
    shop_name: string;
    start_date: string;
    end_date: string;
    attribution_model: string;
    attribution_window: string;
    filter: TimeseriesFilter;
    query_timestamp: string;
  };
}
