/**
 * Unit Tests for Event-Based Analytics Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBasedAnalyticsService } from './event-based-analytics';
import type { ChannelPerformanceData, PixelChannelRawData, CampaignLevelRawData } from '@/types/analytics';

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

// Mock query builder functions
vi.mock('@/utils/event-attribution-query-builder.js', () => ({
  buildEventBasedChannelQuery: vi.fn(() => 'SELECT * FROM channel_query'),
  buildEventBasedAdLevelQuery: vi.fn(() => 'SELECT * FROM ad_level_query'),
  buildEventBasedCampaignQuery: vi.fn(() => 'SELECT * FROM campaign_query'),
}));

// Mock account helpers
vi.mock('@/utils/account-helpers.js', () => ({
  getShopNameFromAccountId: vi.fn(),
}));

// Mock date helpers
vi.mock('@/utils/date-helpers.js', () => ({
  validateDateRange: vi.fn(),
  makeEndDateInclusiveAndFormat: vi.fn((date: Date) => {
    const inclusive = new Date(date);
    inclusive.setDate(inclusive.getDate() + 1);
    return inclusive.toISOString().split('T')[0];
  }),
}));

// Mock channel config
vi.mock('@/config/channels.js', () => ({
  isAdSpendChannel: vi.fn((channel: string) => {
    return ['facebook', 'google', 'meta-ads', 'google-ads'].includes(channel);
  }),
}));

// Mock Supabase (for metadata fetching)
const mockSupabaseClient = {
  from: vi.fn(),
};

vi.mock('@/database/supabase/connection.js', () => ({
  supabaseConnection: {
    getServiceClient: () => mockSupabaseClient,
  },
}));

import { getShopNameFromAccountId } from '@/utils/account-helpers.js';
import { validateDateRange, makeEndDateInclusiveAndFormat } from '@/utils/date-helpers.js';
import { isAdSpendChannel } from '@/config/channels.js';
import {
  buildEventBasedChannelQuery,
  buildEventBasedAdLevelQuery,
  buildEventBasedCampaignQuery,
} from '@/utils/event-attribution-query-builder.js';
import { clickhouseConnection } from '@/database/clickhouse/connection.js';

// ============================================================================
// TESTS
// ============================================================================

describe('EventBasedAnalyticsService', () => {
  let service: EventBasedAnalyticsService;

  beforeEach(() => {
    service = new EventBasedAnalyticsService();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================================================
  // getEventBasedChannelPerformance
  // ==========================================================================

  describe('getEventBasedChannelPerformance', () => {
    const validParams = {
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      attribution_model: 'first_click' as const,
    };

    const mockChannelData: ChannelPerformanceData[] = [
      {
        channel: 'facebook',
        attributed_orders: 100,
        attributed_revenue: 5000,
        distinct_orders_touched: 95,
        attributed_cogs: 2000,
        attributed_payment_fees: 150,
        attributed_tax: 500,
        ad_spend: 1000,
        roas: 5.0,
        net_profit: 1350,
        first_time_customer_orders: 30,
        first_time_customer_revenue: 1500,
        first_time_customer_roas: 1.5,
      },
    ];

    it('should resolve shop name from account ID', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockChannelData);

      await service.getEventBasedChannelPerformance('account-123', validParams);

      expect(getShopNameFromAccountId).toHaveBeenCalledWith('account-123');
    });

    it('should validate date range', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockChannelData);

      await service.getEventBasedChannelPerformance('account-123', validParams);

      expect(validateDateRange).toHaveBeenCalledWith(
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );
    });

    it('should make end date inclusive', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockChannelData);

      await service.getEventBasedChannelPerformance('account-123', validParams);

      expect(makeEndDateInclusiveAndFormat).toHaveBeenCalledWith(new Date('2024-01-31'));
    });

    it('should build correct query', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(makeEndDateInclusiveAndFormat).mockReturnValue('2024-02-01');
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockChannelData);

      await service.getEventBasedChannelPerformance('account-123', validParams);

      expect(buildEventBasedChannelQuery).toHaveBeenCalledWith('first_click', {
        shop_name: 'test-shop.myshopify.com',
        start_date: '2024-01-01',
        end_date: '2024-02-01',
      });
    });

    it('should execute ClickHouse query with correct parameters', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(makeEndDateInclusiveAndFormat).mockReturnValue('2024-02-01');
      vi.mocked(buildEventBasedChannelQuery).mockReturnValue('MOCK_QUERY');
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockChannelData);

      await service.getEventBasedChannelPerformance('account-123', validParams);

      expect(clickhouseConnection.query).toHaveBeenCalledWith('MOCK_QUERY', {
        shop_name: 'test-shop.myshopify.com',
        start_date: '2024-01-01',
        end_date: '2024-02-01',
      });
    });

    it('should return correctly formatted response', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockChannelData);

      const result = await service.getEventBasedChannelPerformance('account-123', validParams);

      expect(result).toEqual({
        data: [
          {
            channel: 'facebook',
            attributed_orders: 100,
            attributed_revenue: 5000,
            distinct_orders_touched: 95,
            attributed_cogs: 2000,
            attributed_payment_fees: 150,
            attributed_tax: 500,
            ad_spend: 1000,
            roas: 5.0,
            net_profit: 1350,
            first_time_customer_orders: 30,
            first_time_customer_revenue: 1500,
            first_time_customer_roas: 1.5,
          },
        ],
        metadata: {
          shop_name: 'test-shop.myshopify.com',
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          attribution_model: 'first_click',
          attribution_window: 'event_based',
          total_channels: 1,
          query_timestamp: expect.any(String),
        },
      });
    });

    it('should handle empty results', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(clickhouseConnection.query).mockResolvedValue([]);

      const result = await service.getEventBasedChannelPerformance('account-123', validParams);

      expect(result.data).toEqual([]);
      expect(result.metadata.total_channels).toBe(0);
    });

    it('should handle all attribution models', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockChannelData);

      const models = ['first_click', 'last_click', 'last_paid_click', 'linear_all', 'linear_paid'] as const;

      for (const model of models) {
        await service.getEventBasedChannelPerformance('account-123', {
          ...validParams,
          attribution_model: model,
        });

        expect(buildEventBasedChannelQuery).toHaveBeenCalledWith(model, expect.any(Object));
      }
    });

    it('should throw error when shop not found', async () => {
      vi.mocked(getShopNameFromAccountId).mockRejectedValue(new Error('Shop not found for account'));

      await expect(
        service.getEventBasedChannelPerformance('invalid-account', validParams)
      ).rejects.toThrow('Shop not found for account');
    });

    it('should throw error when date range invalid', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(validateDateRange).mockImplementation(() => {
        throw new Error('Start date must not be after end date');
      });

      await expect(
        service.getEventBasedChannelPerformance('account-123', {
          ...validParams,
          start_date: '2024-12-31',
          end_date: '2024-01-01',
        })
      ).rejects.toThrow('Start date must not be after end date');
    });

    it('should throw error when ClickHouse query fails', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(clickhouseConnection.query).mockRejectedValue(new Error('ClickHouse connection failed'));

      await expect(
        service.getEventBasedChannelPerformance('account-123', validParams)
      ).rejects.toThrow('ClickHouse connection failed');
    });
  });

  // ==========================================================================
  // getEventBasedPixelChannelPerformance
  // ==========================================================================

  describe('getEventBasedPixelChannelPerformance', () => {
    const validParams = {
      channel: 'facebook',
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      attribution_model: 'first_click' as const,
    };

    it('should route to ad-level query for paid channels', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(isAdSpendChannel).mockReturnValue(true);
      vi.mocked(clickhouseConnection.query).mockResolvedValue([]);

      // Mock Supabase responses for metadata
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      mockSupabaseClient.from.mockReturnValue(mockChain);

      await service.getEventBasedPixelChannelPerformance('account-123', validParams);

      expect(isAdSpendChannel).toHaveBeenCalledWith('facebook');
      expect(buildEventBasedAdLevelQuery).toHaveBeenCalled();
      expect(buildEventBasedCampaignQuery).not.toHaveBeenCalled();
    });

    it('should route to campaign-level query for non-paid channels', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(isAdSpendChannel).mockReturnValue(false);
      vi.mocked(clickhouseConnection.query).mockResolvedValue([]);

      const organicParams = {
        ...validParams,
        channel: 'organic',
      };

      await service.getEventBasedPixelChannelPerformance('account-123', organicParams);

      expect(isAdSpendChannel).toHaveBeenCalledWith('organic');
      expect(buildEventBasedCampaignQuery).toHaveBeenCalled();
      expect(buildEventBasedAdLevelQuery).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // getEventBasedAdLevelPerformance (Private but critical)
  // ==========================================================================

  describe('getEventBasedAdLevelPerformance (via getEventBasedPixelChannelPerformance)', () => {
    const mockAdData: PixelChannelRawData[] = [
      {
        channel: 'meta-ads',
        platform_ad_campaign_id: 'campaign-1',
        platform_ad_set_id: 'adset-1',
        platform_ad_id: 'ad-1',
        ad_campaign_pk: 1,
        ad_set_pk: 1,
        ad_pk: 1,
        attributed_orders: 50,
        attributed_revenue: 2500,
        distinct_orders_touched: 48,
        attributed_cogs: 1000,
        attributed_payment_fees: 75,
        attributed_tax: 250,
        ad_spend: 500,
        impressions: 10000,
        clicks: 500,
        conversions: 50,
        roas: 5.0,
        cpc: 1.0,
        ctr: 5.0,
        net_profit: 675,
        first_time_customer_orders: 15,
        first_time_customer_revenue: 750,
        first_time_customer_roas: 1.5,
      },
    ];

    it('should fetch and organize hierarchical ad metadata', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(isAdSpendChannel).mockReturnValue(true);
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockAdData);

      // Mock Supabase metadata responses
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [
            {
              id: 1,
              name: 'Test Campaign',
              active: true,
              budget: 1000,
              ad_campaign_id: 'campaign-1',
              ad_accounts: { ad_account_id: 'act_123' },
            },
          ],
          error: null,
        }),
      };

      // Different responses for different tables
      mockSupabaseClient.from.mockImplementation((table: string) => {
        if (table === 'ad_sets') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [{ id: 1, name: 'Test Ad Set', active: true, budget: 500, ad_set_id: 'adset-1' }],
              error: null,
            }),
          };
        }
        if (table === 'ads') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [{ id: 1, name: 'Test Ad', active: true, image_url: 'http://example.com/ad.jpg', ad_id: 'ad-1' }],
              error: null,
            }),
          };
        }
        return mockChain;
      });

      const result = await service.getEventBasedPixelChannelPerformance('account-123', {
        channel: 'meta-ads',
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'first_click',
      });

      // Verify hierarchical structure
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Test Campaign');
      expect(result.data[0].ad_sets).toHaveLength(1);
      expect(result.data[0].ad_sets[0].name).toBe('Test Ad Set');
      expect(result.data[0].ad_sets[0].ads).toHaveLength(1);
      expect(result.data[0].ad_sets[0].ads[0].name).toBe('Test Ad');
    });

    it('should aggregate metrics from ads to ad sets', async () => {
      const multipleAdsData: PixelChannelRawData[] = [
        { ...mockAdData[0], ad_pk: 1, attributed_revenue: 1000 },
        { ...mockAdData[0], ad_pk: 2, attributed_revenue: 1500 },
      ];

      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(isAdSpendChannel).mockReturnValue(true);
      vi.mocked(clickhouseConnection.query).mockResolvedValue(multipleAdsData);

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await service.getEventBasedPixelChannelPerformance('account-123', {
        channel: 'meta-ads',
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'first_click',
      });

      // Ad set should have aggregated revenue from both ads
      expect(result.data[0].ad_sets[0].attributed_revenue).toBe(2500);
    });
  });

  // ==========================================================================
  // getEventBasedCampaignLevelPerformance (Private but critical)
  // ==========================================================================

  describe('getEventBasedCampaignLevelPerformance (via getEventBasedPixelChannelPerformance)', () => {
    const mockCampaignData: CampaignLevelRawData[] = [
      {
        channel: 'organic',
        campaign: 'summer-sale',
        attributed_orders: 30,
        attributed_revenue: 1500,
        distinct_orders_touched: 28,
        attributed_cogs: 600,
        attributed_payment_fees: 45,
        attributed_tax: 150,
        net_profit: 705,
        first_time_customer_orders: 10,
        first_time_customer_revenue: 500,
      },
    ];

    it('should return flat campaign list for non-paid channels', async () => {
      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(isAdSpendChannel).mockReturnValue(false);
      vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

      const result = await service.getEventBasedPixelChannelPerformance('account-123', {
        channel: 'organic',
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'first_click',
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        campaign: 'summer-sale',
        name: 'summer-sale',
        attributed_orders: 30,
        attributed_revenue: 1500,
        distinct_orders_touched: 28,
        attributed_cogs: 600,
        attributed_payment_fees: 45,
        attributed_tax: 150,
        net_profit: 705,
        first_time_customer_orders: 10,
        first_time_customer_revenue: 500,
      });
    });

    it('should use "Not Set" for null campaign names', async () => {
      const dataWithNullCampaign: CampaignLevelRawData[] = [
        {
          ...mockCampaignData[0],
          campaign: null as any,
        },
      ];

      vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
      vi.mocked(isAdSpendChannel).mockReturnValue(false);
      vi.mocked(clickhouseConnection.query).mockResolvedValue(dataWithNullCampaign);

      const result = await service.getEventBasedPixelChannelPerformance('account-123', {
        channel: 'organic',
        start_date: '2024-01-01',
        end_date: '2024-01-31',
        attribution_model: 'first_click',
      });

      expect(result.data[0].name).toBe('Not Set');
    });
  });

  // ==========================================================================
  // generateAdManagerUrl (Private utility)
  // ==========================================================================

  describe('generateAdManagerUrl', () => {
    it('should generate correct Meta Ads campaign URL', () => {
      const service = new EventBasedAnalyticsService();
      const url = (service as any).generateAdManagerUrl('meta-ads', 'campaign', 'campaign-123', 'act_456');

      expect(url).toContain('facebook.com/adsmanager/manage/campaigns');
      expect(url).toContain('act=456');
      expect(url).toContain('campaign-123');
    });

    it('should generate correct Google Ads campaign URL', () => {
      const service = new EventBasedAnalyticsService();
      const url = (service as any).generateAdManagerUrl('google-ads', 'campaign', 'campaign-123');

      expect(url).toContain('ads.google.com/aw/campaigns');
      expect(url).toContain('campaignId=campaign-123');
    });

    it('should return undefined for unsupported platforms', () => {
      const service = new EventBasedAnalyticsService();
      const url = (service as any).generateAdManagerUrl('unknown-platform', 'campaign', 'campaign-123');

      expect(url).toBeUndefined();
    });
  });
});
