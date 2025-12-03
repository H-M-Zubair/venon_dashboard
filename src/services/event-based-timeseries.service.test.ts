/**
 * Unit Tests for Event-Based Timeseries Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBasedTimeseriesService } from './event-based-timeseries';
import type { TimeseriesDataPoint } from '@/types/timeseries';

// ============================================================================
// MOCKS
// ============================================================================

// Mock logger
vi.mock('@/config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock ClickHouse connection
vi.mock('@/database/clickhouse/connection.js', () => ({
  clickhouseConnection: {
    query: vi.fn(),
  },
}));

// Mock account helpers
vi.mock('@/utils/account-helpers.js', () => ({
  getShopNameFromAccountId: vi.fn(),
}));

// Mock date helpers
vi.mock('@/utils/date-helpers.js', () => ({
  validateDateRange: vi.fn(),
  shouldUseHourlyAggregation: vi.fn(),
  makeEndDateInclusiveAndFormat: vi.fn((date: Date) => {
    const inclusive = new Date(date);
    inclusive.setDate(inclusive.getDate() + 1);
    return inclusive.toISOString().split('T')[0];
  }),
}));

import { getShopNameFromAccountId } from '@/utils/account-helpers.js';
import { validateDateRange, shouldUseHourlyAggregation, makeEndDateInclusiveAndFormat } from '@/utils/date-helpers.js';
import { clickhouseConnection } from '@/database/clickhouse/connection.js';

// ============================================================================
// TESTS
// ============================================================================

describe('EventBasedTimeseriesService', () => {
  let service: EventBasedTimeseriesService;

  beforeEach(() => {
    service = new EventBasedTimeseriesService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================================================
  // getEventBasedTimeseries - All Channels Filter
  // ==========================================================================

  describe('getEventBasedTimeseries - all_channels filter', () => {
    const validParams = {
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      attribution_model: 'first_click' as const,
      filter: { type: 'all_channels' as const },
    };

    const mockTimeseriesData: TimeseriesDataPoint[] = [
      {
        time_period: '2024-01-01',
        total_ad_spend: 1000,
        total_attributed_revenue: 5000,
        roas: 5.0,
      },
      {
        time_period: '2024-01-02',
        total_ad_spend: 1500,
        total_attributed_revenue: 6000,
        roas: 4.0,
      },
    ];

    it('should resolve shop name from account ID', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockTimeseriesData);

      await service.getEventBasedTimeseries('account-123', validParams);

      expect(getShopNameFromAccountId).toHaveBeenCalledWith('account-123');
    });

    it('should validate date range', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockTimeseriesData);

      await service.getEventBasedTimeseries('account-123', validParams);

      expect(validateDateRange).toHaveBeenCalledWith(
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );
    });

    it('should check if hourly aggregation needed', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockTimeseriesData);

      await service.getEventBasedTimeseries('account-123', validParams);

      expect(shouldUseHourlyAggregation).toHaveBeenCalledWith(
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );
    });

    it('should use daily aggregation for multi-day range', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockTimeseriesData);

      const result = await service.getEventBasedTimeseries('account-123', validParams);

      expect(result.data.aggregation_level).toBe('daily');
    });

    it('should use hourly aggregation for same-day range', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(true);
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockTimeseriesData);

      const sameDayParams = {
        start_date: '2024-01-01',
        end_date: '2024-01-01',
        attribution_model: 'first_click' as const,
        filter: { type: 'all_channels' as const },
      };

      const result = await service.getEventBasedTimeseries('account-123', sameDayParams);

      expect(result.data.aggregation_level).toBe('hourly');
    });

    it('should execute ClickHouse query with correct parameters', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);
      vi.mocked(makeEndDateInclusiveAndFormat).mockReturnValue('2024-02-01');
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockTimeseriesData);

      await service.getEventBasedTimeseries('account-123', validParams);

      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.any(String),
        {
          shop_name: 'test-shop.myshopify.com',
          start_date: '2024-01-01',
          end_date: '2024-02-01',
        }
      );
    });

    it('should return correctly formatted response', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockTimeseriesData);

      const result = await service.getEventBasedTimeseries('account-123', validParams);

      expect(result).toEqual({
        data: {
          timeseries: [
            {
              time_period: '2024-01-01',
              total_ad_spend: 1000,
              total_attributed_revenue: 5000,
              roas: 5.0,
            },
            {
              time_period: '2024-01-02',
              total_ad_spend: 1500,
              total_attributed_revenue: 6000,
              roas: 4.0,
            },
          ],
          aggregation_level: 'daily',
        },
        metadata: {
          shop_name: 'test-shop.myshopify.com',
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          attribution_model: 'first_click',
          attribution_window: 'lifetime',
          filter: { type: 'all_channels' },
          query_timestamp: expect.any(String),
        },
      });
    });

    it('should handle empty results', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);
      vi.mocked(clickhouseConnection.query).mockResolvedValue([]);

      const result = await service.getEventBasedTimeseries('account-123', validParams);

      expect(result.data.timeseries).toEqual([]);
    });

    it('should handle all attribution models', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockTimeseriesData);

      const models = ['first_click', 'last_click', 'last_paid_click', 'linear_all', 'linear_paid'] as const;

      for (const model of models) {
        await service.getEventBasedTimeseries('account-123', {
          ...validParams,
          attribution_model: model,
        });

        expect(clickhouseConnection.query).toHaveBeenCalled();
      }

      expect(clickhouseConnection.query).toHaveBeenCalledTimes(models.length);
    });

    it('should throw error when shop not found', async () => {
      vi.mocked(getShopNameFromAccountId).mockRejectedValue(new Error('Shop not found for account'));

      await expect(
        service.getEventBasedTimeseries('invalid-account', validParams)
      ).rejects.toThrow('Shop not found for account');
    });

    it('should throw error when date range invalid', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(validateDateRange).mockImplementation(() => {
        throw new Error('Start date must not be after end date');
      });

      await expect(
        service.getEventBasedTimeseries('account-123', {
          ...validParams,
          start_date: '2024-12-31',
          end_date: '2024-01-01',
        })
      ).rejects.toThrow('Start date must not be after end date');
    });

    it('should throw error when ClickHouse query fails', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);
      vi.mocked(clickhouseConnection.query).mockRejectedValue(new Error('ClickHouse connection failed'));

      await expect(
        service.getEventBasedTimeseries('account-123', validParams)
      ).rejects.toThrow('ClickHouse connection failed');
    });
  });

  // ==========================================================================
  // getEventBasedTimeseries - Single Channel Filter
  // ==========================================================================

  describe('getEventBasedTimeseries - channel filter', () => {
    const channelParams = {
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      attribution_model: 'first_click' as const,
      filter: { type: 'channel' as const, channel: 'facebook' },
    };

    const mockTimeseriesData: TimeseriesDataPoint[] = [
      {
        time_period: '2024-01-01',
        total_ad_spend: 500,
        total_attributed_revenue: 2500,
        roas: 5.0,
      },
    ];

    it('should include channel in query parameters', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);
      vi.mocked(makeEndDateInclusiveAndFormat).mockReturnValue('2024-02-01');
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockTimeseriesData);

      await service.getEventBasedTimeseries('account-123', channelParams);

      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          channel: 'facebook',
        })
      );
    });

    it('should return correct metadata with channel filter', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockTimeseriesData);

      const result = await service.getEventBasedTimeseries('account-123', channelParams);

      expect(result.metadata.filter).toEqual({ type: 'channel', channel: 'facebook' });
    });
  });

  // ==========================================================================
  // getEventBasedTimeseries - Ad Hierarchy Filter
  // ==========================================================================

  describe('getEventBasedTimeseries - ad_hierarchy filter', () => {
    const adHierarchyParams = {
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      attribution_model: 'first_click' as const,
      filter: {
        type: 'ad_hierarchy' as const,
        channel: 'meta-ads',
        ad_campaign_pk: 1,
        ad_set_pk: 2,
        ad_pk: 3,
      },
    };

    const mockTimeseriesData: TimeseriesDataPoint[] = [
      {
        time_period: '2024-01-01',
        total_ad_spend: 100,
        total_attributed_revenue: 500,
        roas: 5.0,
      },
    ];

    it('should include all hierarchy fields in query parameters', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);
      vi.mocked(makeEndDateInclusiveAndFormat).mockReturnValue('2024-02-01');
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockTimeseriesData);

      await service.getEventBasedTimeseries('account-123', adHierarchyParams);

      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          channel: 'meta-ads',
          ad_campaign_pk: 1,
          ad_set_pk: 2,
          ad_pk: 3,
        })
      );
    });

    it('should handle campaign-only filter', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockTimeseriesData);

      const campaignOnlyParams = {
        ...adHierarchyParams,
        filter: {
          type: 'ad_hierarchy' as const,
          channel: 'meta-ads',
          ad_campaign_pk: 1,
        },
      };

      await service.getEventBasedTimeseries('account-123', campaignOnlyParams);

      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          channel: 'meta-ads',
          ad_campaign_pk: 1,
        })
      );
    });

    it('should handle ad set level filter', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockTimeseriesData);

      const adSetParams = {
        ...adHierarchyParams,
        filter: {
          type: 'ad_hierarchy' as const,
          channel: 'meta-ads',
          ad_campaign_pk: 1,
          ad_set_pk: 2,
        },
      };

      await service.getEventBasedTimeseries('account-123', adSetParams);

      expect(clickhouseConnection.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          channel: 'meta-ads',
          ad_campaign_pk: 1,
          ad_set_pk: 2,
        })
      );
    });
  });

  // ==========================================================================
  // getEventBasedTimeseries - Invalid Filter Type
  // ==========================================================================

  describe('getEventBasedTimeseries - invalid filter', () => {
    it('should throw error for invalid filter type', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);

      const invalidParams = {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'first_click' as const,
        filter: { type: 'invalid_type' as any },
      };

      await expect(
        service.getEventBasedTimeseries('account-123', invalidParams)
      ).rejects.toThrow('Invalid filter type');
    });
  });

  // ==========================================================================
  // getAttributionFilter (Private method testing via integration)
  // ==========================================================================

  describe('attribution filter logic', () => {
    const baseParams = {
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      filter: { type: 'all_channels' as const },
    };

    const mockData: TimeseriesDataPoint[] = [
      { time_period: '2024-01-01', total_ad_spend: 100, total_attributed_revenue: 500, roas: 5.0 },
    ];

    beforeEach(() => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockData);
    });

    it('should use first_click filter in query', async () => {
      await service.getEventBasedTimeseries('account-123', {
        ...baseParams,
        attribution_model: 'first_click',
      });

      const query = vi.mocked(clickhouseConnection.query).mock.calls[0][0] as string;
      expect(query).toContain('is_first_event_overall = TRUE');
    });

    it('should use last_click filter in query', async () => {
      await service.getEventBasedTimeseries('account-123', {
        ...baseParams,
        attribution_model: 'last_click',
      });

      const query = vi.mocked(clickhouseConnection.query).mock.calls[0][0] as string;
      expect(query).toContain('is_last_event_overall = TRUE');
    });

    it('should use last_paid_click filter in query', async () => {
      await service.getEventBasedTimeseries('account-123', {
        ...baseParams,
        attribution_model: 'last_paid_click',
      });

      const query = vi.mocked(clickhouseConnection.query).mock.calls[0][0] as string;
      expect(query).toContain('is_last_paid_event_overall = TRUE');
      expect(query).toContain('has_any_paid_events');
    });

    it('should use TRUE filter for linear_all', async () => {
      await service.getEventBasedTimeseries('account-123', {
        ...baseParams,
        attribution_model: 'linear_all',
      });

      const query = vi.mocked(clickhouseConnection.query).mock.calls[0][0] as string;
      expect(query).toContain('TRUE');
    });

    it('should use is_paid_channel filter for linear_paid', async () => {
      await service.getEventBasedTimeseries('account-123', {
        ...baseParams,
        attribution_model: 'linear_paid',
      });

      const query = vi.mocked(clickhouseConnection.query).mock.calls[0][0] as string;
      expect(query).toContain('is_paid_channel = TRUE');
    });
  });

  // ==========================================================================
  // Query Builder Logic (Private methods tested via integration)
  // ==========================================================================

  describe('query builder logic', () => {
    const mockData: TimeseriesDataPoint[] = [
      { time_period: '2024-01-01', total_ad_spend: 100, total_attributed_revenue: 500, roas: 5.0 },
    ];

    beforeEach(() => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockData);
    });

    it('should use toDate for daily aggregation', async () => {
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);

      await service.getEventBasedTimeseries('account-123', {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'first_click',
        filter: { type: 'all_channels' },
      });

      const query = vi.mocked(clickhouseConnection.query).mock.calls[0][0] as string;
      expect(query).toContain('toDate');
      expect(query).not.toContain('toStartOfHour');
    });

    it('should use toStartOfHour for hourly aggregation', async () => {
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(true);

      await service.getEventBasedTimeseries('account-123', {
        start_date: '2024-01-01',
        end_date: '2024-01-01',
        attribution_model: 'first_click',
        filter: { type: 'all_channels' },
      });

      const query = vi.mocked(clickhouseConnection.query).mock.calls[0][0] as string;
      expect(query).toContain('toStartOfHour');
    });

    it('should query int_event_metadata table', async () => {
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);

      await service.getEventBasedTimeseries('account-123', {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'first_click',
        filter: { type: 'all_channels' },
      });

      const query = vi.mocked(clickhouseConnection.query).mock.calls[0][0] as string;
      expect(query).toContain('int_event_metadata');
    });

    it('should query int_ad_spend table', async () => {
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);

      await service.getEventBasedTimeseries('account-123', {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'first_click',
        filter: { type: 'all_channels' },
      });

      const query = vi.mocked(clickhouseConnection.query).mock.calls[0][0] as string;
      expect(query).toContain('int_ad_spend');
    });

    it('should use UNION ALL to combine event and spend data', async () => {
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);

      await service.getEventBasedTimeseries('account-123', {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'first_click',
        filter: { type: 'all_channels' },
      });

      const query = vi.mocked(clickhouseConnection.query).mock.calls[0][0] as string;
      expect(query).toContain('UNION ALL');
    });

    it('should calculate ROAS in query', async () => {
      vi.mocked(shouldUseHourlyAggregation).mockReturnValue(false);

      await service.getEventBasedTimeseries('account-123', {
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'first_click',
        filter: { type: 'all_channels' },
      });

      const query = vi.mocked(clickhouseConnection.query).mock.calls[0][0] as string;
      expect(query).toMatch(/SUM\(attributed_revenue\)\s*\/\s*SUM\(ad_spend\)/i);
      expect(query).toContain('AS roas');
    });
  });
});
