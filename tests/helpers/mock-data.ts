/**
 * Mock Data Generators for Unit Tests
 *
 * These functions generate mock data for use in unit tests.
 * They should NOT be used in integration tests (which use real data).
 */

import type { ChannelPerformanceData } from '@/types/analytics.js';
import type { TimeseriesDataPoint } from '@/types/timeseries.js';
import type { OrderInfo } from '@/types/orders-attribution.js';

/**
 * Generates mock channel performance data
 */
export function mockChannelPerformance(
  overrides: Partial<ChannelPerformanceData> = {}
): ChannelPerformanceData {
  return {
    channel: 'google-ads',
    attributed_orders: 100,
    attributed_revenue: 5000,
    distinct_orders_touched: 95,
    attributed_cogs: 2000,
    attributed_payment_fees: 100,
    attributed_tax: 500,
    ad_spend: 1000,
    roas: 5.0,
    net_profit: 2400,
    first_time_customer_orders: 50,
    first_time_customer_revenue: 2500,
    first_time_customer_roas: 2.5,
    ...overrides,
  };
}

/**
 * Generates mock timeseries data point
 */
export function mockTimeseriesPoint(
  overrides: Partial<TimeseriesDataPoint> = {}
): TimeseriesDataPoint {
  return {
    time_period: '2024-01-01',
    ad_spend: 100,
    attributed_revenue: 500,
    roas: 5.0,
    ...overrides,
  };
}

/**
 * Generates mock order information
 */
export function mockOrder(overrides: Partial<OrderInfo> = {}): OrderInfo {
  return {
    order_id: 'gid://shopify/Order/123456789',
    order_number: '1001',
    total_price: 100,
    is_first_customer_order: 1,
    ...overrides,
  };
}

/**
 * Generates multiple mock orders
 */
export function mockOrders(count: number, baseOverrides: Partial<OrderInfo> = {}): OrderInfo[] {
  return Array.from({ length: count }, (_, i) =>
    mockOrder({
      order_id: `gid://shopify/Order/${123456789 + i}`,
      order_number: `${1001 + i}`,
      ...baseOverrides,
    })
  );
}

/**
 * Generates mock channel performance for multiple channels
 */
export function mockMultipleChannels(channels: string[]): ChannelPerformanceData[] {
  return channels.map((channel, index) =>
    mockChannelPerformance({
      channel,
      attributed_revenue: 1000 * (index + 1),
      ad_spend: 200 * (index + 1),
      roas: 5.0 - index * 0.5,
    })
  );
}

/**
 * Generates mock timeseries data for a date range
 */
export function mockTimeseriesRange(startDate: string, days: number): TimeseriesDataPoint[] {
  const data: TimeseriesDataPoint[] = [];
  const start = new Date(startDate);

  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);

    data.push(
      mockTimeseriesPoint({
        time_period: date.toISOString().split('T')[0]!,
        ad_spend: 100 + Math.random() * 50,
        attributed_revenue: 500 + Math.random() * 200,
        roas: 4.0 + Math.random() * 2,
      })
    );
  }

  return data;
}

/**
 * Mock Supabase client for unit tests
 */
export function mockSupabaseClient() {
  return {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { shop_name: 'test-shop' },
      error: null,
    }),
    insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
    update: vi.fn().mockResolvedValue({ data: {}, error: null }),
    delete: vi.fn().mockResolvedValue({ data: {}, error: null }),
  };
}

/**
 * Mock ClickHouse query result
 */
export function mockClickHouseResult<T = any>(data: T[]): T[] {
  return data;
}
