import { z } from 'zod';

// Request validation schemas
export const channelPerformanceQuerySchema = z.object({
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
      .default('linear_paid'),
    attribution_window: z
      .enum(['1_day', '7_day', '14_day', '28_day', '90_day', 'lifetime'])
      .default('28_day'),
  }),
});

export type ChannelPerformanceQuery = z.infer<typeof channelPerformanceQuerySchema>;

// Response types
export interface ChannelPerformanceData {
  channel: string;
  attributed_orders: number;
  attributed_revenue: number;
  distinct_orders_touched: number;
  attributed_cogs: number;
  attributed_payment_fees: number;
  attributed_tax: number;
  ad_spend: number;
  roas: number;
  net_profit: number;
  first_time_customer_orders: number;
  first_time_customer_revenue: number;
  first_time_customer_roas: number;
}

export interface ChannelPerformanceResponse {
  data: ChannelPerformanceData[];
  metadata: {
    shop_name: string;
    start_date: string;
    end_date: string;
    attribution_model: string;
    attribution_window: string;
    total_channels: number;
    query_timestamp: string;
  };
}

// Internal ClickHouse result types
export interface ChannelAttributionRow {
  channel: string;
  shopify_shop: string;
  attributed_orders: string;
  attributed_revenue: string;
  distinct_orders_touched: string;
  attributed_cogs: string;
  attributed_payment_fees: string;
  attributed_tax: string;
}

export interface ChannelSpendRow {
  channel: string;
  ad_spend: string;
}

export interface ShopVatSettingsRow {
  shop_name: string;
  ignore_vat: boolean;
}

// Pixel Channel Performance Types
export const pixelChannelQuerySchema = z.object({
  query: z.object({
    account_id: z.string().min(1, 'Account ID is required'),
    channel: z.string().min(1, 'Channel is required'),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    attribution_model: z
      .enum([
        'first_click',
        'last_click',
        'last_paid_click',
        'linear_paid',
        'linear_all',
        'all_clicks',
      ])
      .default('last_paid_click'),
    attribution_window: z
      .enum(['1_day', '7_day', '14_day', '28_day', '90_day', 'lifetime'])
      .default('28_day'),
  }),
});

export type PixelChannelQuery = z.infer<typeof pixelChannelQuerySchema>;

export type PixelChannelRawData = {
  channel: string;
  platform_ad_campaign_id: string;
  platform_ad_set_id: string;
  platform_ad_id: string;
  ad_campaign_pk: number;
  ad_set_pk: number;
  ad_pk: number;
  attributed_orders: number;
  attributed_revenue: number;
  distinct_orders_touched: number;
  attributed_cogs: number;
  attributed_payment_fees: number;
  attributed_tax: number;
  ad_spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
  cpc: number;
  ctr: number;
  net_profit: number;
  first_time_customer_orders: number;
  first_time_customer_revenue: number;
  first_time_customer_roas: number;
};

export type CampaignMetadata = {
  id: number;
  name: string;
  active: boolean;
  budget: number | null;
  ad_campaign_id?: string;
  ad_accounts?: {
    ad_account_id: string;
  } | null;
};

export type AdSetMetadata = {
  id: number;
  name: string;
  active: boolean;
  budget: number | null;
  ad_set_id?: string;
};

export type AdMetadata = {
  id: number;
  name: string;
  active: boolean;
  image_url: string | null;
  ad_id?: string;
};

export type PixelChannelAdData = {
  id: number;
  platform_ad_id: string;
  name: string;
  active: boolean;
  image_url: string | null;
  url?: string;
  // Metrics
  attributed_orders: number;
  attributed_revenue: number;
  distinct_orders_touched: number;
  attributed_cogs: number;
  attributed_payment_fees: number;
  attributed_tax: number;
  ad_spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
  cpc: number;
  ctr: number;
  net_profit: number;
  first_time_customer_orders: number;
  first_time_customer_revenue: number;
  first_time_customer_roas: number;
};

export type PixelChannelAdSetData = {
  id: number;
  platform_ad_set_id: string;
  name: string;
  active: boolean;
  budget: number | null;
  url?: string;
  ads: PixelChannelAdData[];
  // Aggregated metrics
  attributed_orders: number;
  attributed_revenue: number;
  distinct_orders_touched: number;
  attributed_cogs: number;
  attributed_payment_fees: number;
  attributed_tax: number;
  ad_spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
  net_profit: number;
  first_time_customer_orders: number;
  first_time_customer_revenue: number;
  first_time_customer_roas: number;
};

export type PixelChannelCampaignData = {
  id: number;
  platform_ad_campaign_id: string;
  name: string;
  active: boolean;
  budget: number | null;
  url?: string;
  ad_sets: PixelChannelAdSetData[];
  // Aggregated metrics
  attributed_orders: number;
  attributed_revenue: number;
  distinct_orders_touched: number;
  attributed_cogs: number;
  attributed_payment_fees: number;
  attributed_tax: number;
  ad_spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
  net_profit: number;
  first_time_customer_orders: number;
  first_time_customer_revenue: number;
  first_time_customer_roas: number;
};

export type PixelChannelResponse = {
  data: PixelChannelCampaignData[];
  metadata: {
    channel: string;
    shop_name: string;
    start_date: string;
    end_date: string;
    attribution_model: string;
    attribution_window: string;
    total_campaigns: number;
    total_ad_sets: number;
    total_ads: number;
    query_timestamp: string;
  };
};

// Dashboard Metrics Types
export const dashboardMetricsQuerySchema = z.object({
  query: z.object({
    account_id: z.string().min(1, 'Account ID is required'),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
  }),
});

export type DashboardMetricsQuery = z.infer<typeof dashboardMetricsQuerySchema>;

export interface DashboardMetricsTimeseries {
  timestamp: string;
  total_orders: number;
  total_revenue: number;
  total_refunds: number;
  total_cogs: number;
  total_ad_spend: number;
  profit: number;
  roas: number;
  new_customer_count: number;
  new_customer_revenue: number;
  new_customer_roas: number;
  cac: number;
}

export interface DashboardMetricsResponse {
  data: {
    timeseries: DashboardMetricsTimeseries[];
    aggregation_level: 'hourly' | 'daily';
  };
  metadata: {
    shop_name: string;
    start_date: string;
    end_date: string;
    query_timestamp: string;
  };
}

// ======================================================================================
// EVENT-BASED ATTRIBUTION TYPES
// Event-based attribution uses event timestamps instead of pre-calculated attribution windows
// ======================================================================================

// Event-Based Channel Performance Query Schema
export const eventBasedChannelPerformanceQuerySchema = z.object({
  query: z.object({
    account_id: z.string().min(1, 'Account ID is required'),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
    attribution_model: z
      .enum(['first_click', 'last_click', 'last_paid_click', 'linear_all', 'linear_paid'])
      .default('last_paid_click'),
    // Note: No attribution_window - event-based uses event_timestamp filtering
  }),
});

export type EventBasedChannelPerformanceQuery = z.infer<
  typeof eventBasedChannelPerformanceQuerySchema
>;

// Event-Based Pixel Channel Performance Query Schema
export const eventBasedPixelChannelQuerySchema = z.object({
  query: z.object({
    account_id: z.string().min(1, 'Account ID is required'),
    channel: z.string().min(1, 'Channel is required'),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
    attribution_model: z
      .enum(['first_click', 'last_click', 'last_paid_click', 'linear_all', 'linear_paid'])
      .default('last_paid_click'),
  }),
});

export type EventBasedPixelChannelQuery = z.infer<typeof eventBasedPixelChannelQuerySchema>;

// Campaign-Level Raw Data (for non-paid channels like organic, direct, email)
export type CampaignLevelRawData = {
  channel: string;
  campaign: string;
  attributed_orders: number;
  attributed_revenue: number;
  distinct_orders_touched: number;
  attributed_cogs: number;
  attributed_payment_fees: number;
  attributed_tax: number;
  net_profit: number;
  first_time_customer_orders: number;
  first_time_customer_revenue: number;
};

// Campaign-Level Organized Data
export type CampaignLevelData = {
  campaign: string;
  name: string; // Display name (same as campaign for non-ad channels)
  // Metrics
  attributed_orders: number;
  attributed_revenue: number;
  distinct_orders_touched: number;
  attributed_cogs: number;
  attributed_payment_fees: number;
  attributed_tax: number;
  net_profit: number;
  first_time_customer_orders: number;
  first_time_customer_revenue: number;
};

// Campaign-Level Response (for non-paid channels)
export type CampaignLevelResponse = {
  data: CampaignLevelData[];
  metadata: {
    channel: string;
    shop_name: string;
    start_date: string;
    end_date: string;
    attribution_model: string;
    total_campaigns: number;
    query_timestamp: string;
  };
};

// Event-Based Channel Performance Response (reuses ChannelPerformanceResponse)
// The data structure is the same, just calculated differently

// Event-Based Pixel Channel Response
// For paid channels: reuses PixelChannelResponse (ad hierarchy)
// For non-paid channels: uses CampaignLevelResponse (campaign list)
