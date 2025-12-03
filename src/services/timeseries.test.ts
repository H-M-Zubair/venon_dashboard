/**
 * Unit tests for TimeseriesService
 *
 * Testing strategy:
 * - Mock ClickHouse connection for timeseries queries
 * - Mock Supabase connection for shop name resolution
 * - Mock utility functions for date handling and attribution tables
 * - Test all query patterns: all_channels, channel, ad_hierarchy
 * - Test time bucketing logic (hourly vs daily aggregation)
 * - Test date range handling and inclusive end dates
 * - Test ROAS calculations with division by zero protection
 * - Test data transformation (string to number conversions)
 * - Test attribution model integration
 * - Test error handling scenarios
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@/database/clickhouse/connection.js', () => ({
  clickhouseConnection: {
    query: vi.fn(),
  },
}));

vi.mock('@/config/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/utils/attribution-tables.js', () => ({
  getAttributionTableName: vi.fn((model) => `attribution_${model}`),
}));

vi.mock('@/utils/account-helpers.js', () => ({
  getShopNameFromAccountId: vi.fn(async (accountId) => `shop-${accountId}.myshopify.com`),
}));

vi.mock('@/utils/date-helpers.js', () => ({
  validateDateRange: vi.fn(),
  makeEndDateInclusiveAndFormat: vi.fn((date) => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }),
  shouldUseHourlyAggregation: vi.fn((start, end) => {
    const diff = end.getTime() - start.getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    return days <= 3;
  }),
}));

// Import after mocks
import { TimeseriesService } from './timeseries.js';
import { clickhouseConnection } from '@/database/clickhouse/connection.js';
import type { TimeseriesDataPoint } from '@/types/timeseries.js';

describe('TimeseriesService', () => {
  let service: TimeseriesService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new TimeseriesService();

    // Reset all mocks to default behavior
    const { getShopNameFromAccountId } = await import('@/utils/account-helpers.js');
    vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');

    const { validateDateRange } = await import('@/utils/date-helpers.js');
    vi.mocked(validateDateRange).mockImplementation(() => {});
  });

  describe('Date Range and Time Bucketing', () => {
    it('should use hourly aggregation for date ranges <= 3 days', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01 00:00:00',
          total_ad_spend: '100.00',
          total_attributed_revenue: '500.00',
          roas: '5.00',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-03', // 2 days - should use hourly
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      const result = await service.getTimeseries('account-123', params);

      expect(result.data.aggregation_level).toBe('hourly');
      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('toStartOfHour'),
        expect.any(Object)
      );
    });

    it('should use daily aggregation for date ranges > 3 days', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '100.00',
          total_attributed_revenue: '500.00',
          roas: '5.00',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-10', // 9 days - should use daily
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      const result = await service.getTimeseries('account-123', params);

      expect(result.data.aggregation_level).toBe('daily');
      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('toDate'),
        expect.any(Object)
      );
    });

    it('should handle boundary case of exactly 3 days', async () => {
      const mockResults: TimeseriesDataPoint[] = [];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-04', // Exactly 3 days
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      await service.getTimeseries('account-123', params);

      const { shouldUseHourlyAggregation } = await import('@/utils/date-helpers.js');
      expect(shouldUseHourlyAggregation).toHaveBeenCalled();
    });

    it('should make end date inclusive by adding 1 day', async () => {
      const mockResults: TimeseriesDataPoint[] = [];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      await service.getTimeseries('account-123', params);

      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          end_date: '2024-02-01', // Should be incremented by 1 day
        })
      );
    });

    it('should properly format dates for ClickHouse queries', async () => {
      const mockResults: TimeseriesDataPoint[] = [];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-15',
        end_date: '2024-01-20',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '14_day' as const,
      };

      await service.getTimeseries('account-123', params);

      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          start_date: '2024-01-15',
          end_date: '2024-01-21', // Inclusive end date
        })
      );
    });
  });

  describe('All Channels Query Pattern', () => {
    it('should aggregate data across all channels', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '1000.00',
          total_attributed_revenue: '5000.00',
          roas: '5.00',
        } as any,
        {
          time_period: '2024-01-02',
          total_ad_spend: '1500.00',
          total_attributed_revenue: '7500.00',
          roas: '5.00',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
        filter: { type: 'all_channels' as const },
      };

      const result = await service.getTimeseries('account-123', params);

      expect(result.data.timeseries).toHaveLength(2);
      expect(result.data.timeseries[0].total_ad_spend).toBe(1000);
      expect(result.data.timeseries[0].total_attributed_revenue).toBe(5000);
      expect(result.metadata.filter.type).toBe('all_channels');
    });

    it('should use UNION ALL to combine attribution and ad spend queries', async () => {
      const mockResults: TimeseriesDataPoint[] = [];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'linear_paid' as const,
        attribution_window: '28_day' as const,
      };

      await service.getTimeseries('account-123', params);

      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('UNION ALL'),
        expect.any(Object)
      );
      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('int_ad_spend'),
        expect.any(Object)
      );
    });

    it('should handle empty results for all channels', async () => {
      const mockResults: TimeseriesDataPoint[] = [];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      const result = await service.getTimeseries('account-123', params);

      expect(result.data.timeseries).toHaveLength(0);
      expect(result.data.aggregation_level).toBe('daily');
    });

    it('should handle mixed paid and organic channels', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '500.00', // Some paid channels
          total_attributed_revenue: '2500.00', // Mix of paid and organic
          roas: '5.00',
        } as any,
        {
          time_period: '2024-01-02',
          total_ad_spend: '0.00', // Organic only
          total_attributed_revenue: '1000.00',
          roas: '0.00',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'linear_all' as const,
        attribution_window: '28_day' as const,
      };

      const result = await service.getTimeseries('account-123', params);

      expect(result.data.timeseries[0].total_ad_spend).toBe(500);
      expect(result.data.timeseries[1].total_ad_spend).toBe(0);
      expect(result.data.timeseries[1].roas).toBe(0);
    });
  });

  describe('Single Channel Query Pattern', () => {
    it('should filter by specific channel (google)', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '800.00',
          total_attributed_revenue: '4000.00',
          roas: '5.00',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
        filter: {
          type: 'channel' as const,
          channel: 'google',
        },
      };

      const result = await service.getTimeseries('account-123', params);

      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          channel: 'google',
        })
      );
      expect(result.data.timeseries).toHaveLength(1);
      expect(result.metadata.filter.type).toBe('channel');
    });

    it('should return empty results for non-existent channel', async () => {
      const mockResults: TimeseriesDataPoint[] = [];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
        filter: {
          type: 'channel' as const,
          channel: 'non-existent-channel',
        },
      };

      const result = await service.getTimeseries('account-123', params);

      expect(result.data.timeseries).toHaveLength(0);
    });

    it('should handle channel with no ad spend', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '0.00',
          total_attributed_revenue: '1000.00',
          roas: '0.00',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
        filter: {
          type: 'channel' as const,
          channel: 'organic',
        },
      };

      const result = await service.getTimeseries('account-123', params);

      expect(result.data.timeseries[0].total_ad_spend).toBe(0);
      expect(result.data.timeseries[0].roas).toBe(0);
    });

    it('should handle channel with no attributed orders', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '500.00',
          total_attributed_revenue: '0.00',
          roas: '0.00',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
        filter: {
          type: 'channel' as const,
          channel: 'tiktok',
        },
      };

      const result = await service.getTimeseries('account-123', params);

      expect(result.data.timeseries[0].total_attributed_revenue).toBe(0);
      expect(result.data.timeseries[0].roas).toBe(0);
    });
  });

  describe('Ad Hierarchy Query Pattern', () => {
    it('should filter by campaign level', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '300.00',
          total_attributed_revenue: '1500.00',
          roas: '5.00',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
        filter: {
          type: 'ad_hierarchy' as const,
          channel: 'google',
          ad_campaign_pk: 12345,
        },
      };

      const result = await service.getTimeseries('account-123', params);

      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('ad_campaign_pk = {ad_campaign_pk:UInt64}'),
        expect.objectContaining({
          channel: 'google',
          ad_campaign_pk: 12345,
        })
      );
      expect(result.metadata.filter.type).toBe('ad_hierarchy');
    });

    it('should filter by ad set level', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '150.00',
          total_attributed_revenue: '750.00',
          roas: '5.00',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
        filter: {
          type: 'ad_hierarchy' as const,
          channel: 'meta',
          ad_campaign_pk: 12345,
          ad_set_pk: 67890,
        },
      };

      const result = await service.getTimeseries('account-123', params);

      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('ad_set_pk = {ad_set_pk:UInt64}'),
        expect.objectContaining({
          ad_campaign_pk: 12345,
          ad_set_pk: 67890,
        })
      );
    });

    it('should filter by ad level (most granular)', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '50.00',
          total_attributed_revenue: '250.00',
          roas: '5.00',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
        filter: {
          type: 'ad_hierarchy' as const,
          channel: 'tiktok',
          ad_campaign_pk: 12345,
          ad_set_pk: 67890,
          ad_pk: 11111,
        },
      };

      const result = await service.getTimeseries('account-123', params);

      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('ad_pk = {ad_pk:UInt64}'),
        expect.objectContaining({
          ad_campaign_pk: 12345,
          ad_set_pk: 67890,
          ad_pk: 11111,
        })
      );
    });

    it('should return empty results for non-existent campaign', async () => {
      const mockResults: TimeseriesDataPoint[] = [];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
        filter: {
          type: 'ad_hierarchy' as const,
          channel: 'google',
          ad_campaign_pk: 99999, // Non-existent
        },
      };

      const result = await service.getTimeseries('account-123', params);

      expect(result.data.timeseries).toHaveLength(0);
    });

    it('should handle hierarchy with multiple time periods', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '100.00',
          total_attributed_revenue: '500.00',
          roas: '5.00',
        } as any,
        {
          time_period: '2024-01-02',
          total_ad_spend: '120.00',
          total_attributed_revenue: '600.00',
          roas: '5.00',
        } as any,
        {
          time_period: '2024-01-03',
          total_ad_spend: '80.00',
          total_attributed_revenue: '400.00',
          roas: '5.00',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
        filter: {
          type: 'ad_hierarchy' as const,
          channel: 'google',
          ad_campaign_pk: 12345,
        },
      };

      const result = await service.getTimeseries('account-123', params);

      expect(result.data.timeseries).toHaveLength(3);
    });
  });

  describe('ROAS Calculations', () => {
    it('should calculate ROAS with valid ad_spend', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '200.00',
          total_attributed_revenue: '1000.00',
          roas: '5.00',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      const result = await service.getTimeseries('account-123', params);

      expect(result.data.timeseries[0].roas).toBe(5);
      expect(result.data.timeseries[0].total_ad_spend).toBe(200);
      expect(result.data.timeseries[0].total_attributed_revenue).toBe(1000);
    });

    it('should return ROAS = 0 when ad_spend is 0 (NULLIF protection)', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '0.00',
          total_attributed_revenue: '500.00',
          roas: '0.00',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      const result = await service.getTimeseries('account-123', params);

      expect(result.data.timeseries[0].roas).toBe(0);
      expect(result.data.timeseries[0].total_ad_spend).toBe(0);
    });

    it('should handle negative ROAS scenarios (refunds > revenue)', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '500.00',
          total_attributed_revenue: '-200.00', // Net negative due to refunds
          roas: '-0.40',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      const result = await service.getTimeseries('account-123', params);

      expect(result.data.timeseries[0].roas).toBe(-0.4);
      expect(result.data.timeseries[0].total_attributed_revenue).toBe(-200);
    });

    it('should handle ROAS with very small ad_spend values', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '0.01',
          total_attributed_revenue: '100.00',
          roas: '10000.00',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      const result = await service.getTimeseries('account-123', params);

      expect(result.data.timeseries[0].roas).toBe(10000);
      expect(result.data.timeseries[0].total_ad_spend).toBe(0.01);
    });
  });

  describe('Attribution Model Integration', () => {
    it('should use last_paid_click attribution model', async () => {
      const mockResults: TimeseriesDataPoint[] = [];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      await service.getTimeseries('account-123', params);

      const { getAttributionTableName } = await import('@/utils/attribution-tables.js');
      expect(getAttributionTableName).toHaveBeenCalledWith('last_paid_click');

      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('attribution_last_paid_click'),
        expect.any(Object)
      );
    });

    it('should use first_click attribution model', async () => {
      const mockResults: TimeseriesDataPoint[] = [];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'first_click' as const,
        attribution_window: '7_day' as const,
      };

      await service.getTimeseries('account-123', params);

      const { getAttributionTableName } = await import('@/utils/attribution-tables.js');
      expect(getAttributionTableName).toHaveBeenCalledWith('first_click');

      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.stringContaining('attribution_first_click'),
        expect.any(Object)
      );
    });

    it('should handle all supported attribution models', async () => {
      const models = [
        'last_paid_click',
        'first_click',
        'last_click',
        'linear_paid',
        'linear_all',
        'all_clicks',
      ] as const;

      for (const model of models) {
        vi.clearAllMocks();

        const mockResults: TimeseriesDataPoint[] = [];
        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

        const params = {
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          attribution_model: model,
          attribution_window: '28_day' as const,
        };

        await service.getTimeseries('account-123', params);

        const { getAttributionTableName } = await import('@/utils/attribution-tables.js');
        expect(getAttributionTableName).toHaveBeenCalledWith(model);
      }
    });
  });

  describe('Data Transformation', () => {
    it('should convert ClickHouse string values to numbers', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '123.45',
          total_attributed_revenue: '678.90',
          roas: '5.50',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      const result = await service.getTimeseries('account-123', params);

      expect(typeof result.data.timeseries[0].total_ad_spend).toBe('number');
      expect(typeof result.data.timeseries[0].total_attributed_revenue).toBe('number');
      expect(typeof result.data.timeseries[0].roas).toBe('number');
      expect(result.data.timeseries[0].total_ad_spend).toBe(123.45);
      expect(result.data.timeseries[0].total_attributed_revenue).toBe(678.9);
      expect(result.data.timeseries[0].roas).toBe(5.5);
    });

    it('should match TimeseriesResponse structure', async () => {
      const mockResults: TimeseriesDataPoint[] = [
        {
          time_period: '2024-01-01',
          total_ad_spend: '100.00',
          total_attributed_revenue: '500.00',
          roas: '5.00',
        } as any,
      ];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
        filter: { type: 'channel' as const, channel: 'google' },
      };

      const result = await service.getTimeseries('account-123', params);

      // Verify response structure
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('metadata');
      expect(result.data).toHaveProperty('timeseries');
      expect(result.data).toHaveProperty('aggregation_level');
      expect(result.metadata).toHaveProperty('shop_name');
      expect(result.metadata).toHaveProperty('start_date');
      expect(result.metadata).toHaveProperty('end_date');
      expect(result.metadata).toHaveProperty('attribution_model');
      expect(result.metadata).toHaveProperty('attribution_window');
      expect(result.metadata).toHaveProperty('filter');
      expect(result.metadata).toHaveProperty('query_timestamp');

      // Verify metadata values
      expect(result.metadata.shop_name).toBe('test-shop.myshopify.com');
      expect(result.metadata.start_date).toBe('2024-01-01');
      expect(result.metadata.end_date).toBe('2024-01-31');
      expect(result.metadata.attribution_model).toBe('last_paid_click');
      expect(result.metadata.attribution_window).toBe('28_day');
      expect(result.metadata.filter).toEqual({ type: 'channel', channel: 'google' });
    });

    it('should transform empty result set correctly', async () => {
      const mockResults: TimeseriesDataPoint[] = [];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      const result = await service.getTimeseries('account-123', params);

      expect(result.data.timeseries).toEqual([]);
      expect(Array.isArray(result.data.timeseries)).toBe(true);
      expect(result.metadata.shop_name).toBe('test-shop.myshopify.com');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when shop is not found', async () => {
      const { getShopNameFromAccountId } = await import('@/utils/account-helpers.js');
      vi.mocked(getShopNameFromAccountId).mockRejectedValue(new Error('Shop not found'));

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      await expect(service.getTimeseries('invalid-account', params)).rejects.toThrow(
        'Shop not found'
      );
    });

    it('should throw error for invalid filter type', async () => {
      const mockResults: TimeseriesDataPoint[] = [];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
        filter: { type: 'invalid_type' } as any,
      };

      await expect(service.getTimeseries('account-123', params)).rejects.toThrow(
        'Invalid filter type'
      );
    });

    it('should handle ClickHouse query errors gracefully', async () => {
      vi.mocked(clickhouseConnection.query).mockRejectedValue(
        new Error('ClickHouse connection failed')
      );

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      await expect(service.getTimeseries('account-123', params)).rejects.toThrow(
        'ClickHouse connection failed'
      );
    });

    it('should handle invalid date range errors', async () => {
      const { validateDateRange } = await import('@/utils/date-helpers.js');
      vi.mocked(validateDateRange).mockImplementation(() => {
        throw new Error('End date must be after start date');
      });

      const params = {
        start_date: '2024-01-31',
        end_date: '2024-01-01', // Invalid: end before start
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      await expect(service.getTimeseries('account-123', params)).rejects.toThrow(
        'End date must be after start date'
      );
    });
  });

  describe('Attribution Window Handling', () => {
    it('should pass attribution_window parameter to query', async () => {
      const mockResults: TimeseriesDataPoint[] = [];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '7_day' as const,
      };

      await service.getTimeseries('account-123', params);

      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          attribution_window: '7_day',
        })
      );
    });

    it('should handle different attribution windows', async () => {
      const windows = ['1_day', '7_day', '14_day', '28_day', '90_day', 'lifetime'] as const;

      for (const window of windows) {
        vi.clearAllMocks();

        const mockResults: TimeseriesDataPoint[] = [];
        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

        const params = {
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          attribution_model: 'last_paid_click' as const,
          attribution_window: window,
        };

        await service.getTimeseries('account-123', params);

        expect(clickhouseConnection.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            attribution_window: window,
          })
        );
      }
    });
  });

  describe('Query Timestamp', () => {
    it('should include query_timestamp in metadata', async () => {
      const mockResults: TimeseriesDataPoint[] = [];

      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockResults);

      const beforeTime = new Date();

      const params = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'last_paid_click' as const,
        attribution_window: '28_day' as const,
      };

      const result = await service.getTimeseries('account-123', params);

      const afterTime = new Date();
      const queryTimestamp = new Date(result.metadata.query_timestamp);

      expect(queryTimestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(queryTimestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
      expect(result.metadata.query_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});
