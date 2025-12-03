/**
 * Unit tests for OrdersAttributionService
 *
 * Testing strategy:
 * - Mock ClickHouse and Supabase connections
 * - Test with different attribution models and windows
 * - Test with ad-spend vs non-ad-spend channels
 * - Test optional filters (ad hierarchy, campaign, first-time customers)
 * - Verify query construction and parameter handling
 * - Test error scenarios
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@/database/clickhouse/connection.js', () => ({
  clickhouseConnection: {
    getClient: vi.fn(),
  },
}));

vi.mock('@/database/supabase/connection.js', () => ({
  supabaseConnection: {
    getServiceClient: vi.fn(),
  },
}));

vi.mock('@/utils/attribution-tables.js', () => ({
  getAttributionTableName: vi.fn((model: string) => {
    const tableMap: Record<string, string> = {
      first_click: 'int_first_click_attribution',
      last_click: 'int_last_click_attribution',
      last_paid_click: 'int_last_paid_click_attribution',
    };
    return tableMap[model] || 'int_last_paid_click_attribution';
  }),
}));

vi.mock('@/config/channels.js', () => ({
  isAdSpendChannel: vi.fn(),
}));

// Import after mocks
import { OrdersAttributionService } from './orders-attribution.js';
import { clickhouseConnection } from '@/database/clickhouse/connection.js';
import { supabaseConnection } from '@/database/supabase/connection.js';
import { isAdSpendChannel } from '@/config/channels.js';
import { OrdersAttributionRequest } from '@/types/orders-attribution.js';

describe('OrdersAttributionService', () => {
  let service: OrdersAttributionService;
  let mockClickHouseClient: any;
  let mockSupabaseClient: any;

  const mockOrders = [
    {
      order_id: 'order-123',
      order_number: '1001',
      order_timestamp: '2024-01-15 10:00:00',
      is_first_customer_order: 1,
    },
    {
      order_id: 'order-456',
      order_number: '1002',
      order_timestamp: '2024-01-16 14:30:00',
      is_first_customer_order: 0,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrdersAttributionService();

    // Mock ClickHouse client
    mockClickHouseClient = {
      query: vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(mockOrders),
      }),
    };

    vi.mocked(clickhouseConnection.getClient).mockReturnValue(mockClickHouseClient);

    // Mock Supabase client
    const supabaseChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { shop_name: 'test-shop.myshopify.com' },
        error: null,
      }),
    };

    mockSupabaseClient = {
      from: vi.fn().mockReturnValue(supabaseChain),
    };

    vi.mocked(supabaseConnection.getServiceClient).mockReturnValue(mockSupabaseClient);
  });

  describe('getOrdersForAttribution', () => {
    const baseParams: OrdersAttributionRequest = {
      accountId: 'account-123',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      attributionModel: 'last_paid_click',
      attributionWindow: '30',
      channel: 'meta-ads',
    };

    describe('Success Scenarios', () => {
      it('should fetch orders for ad-spend channel successfully', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const result = await service.getOrdersForAttribution(baseParams);

        expect(result.success).toBe(true);
        expect(result.result?.orders).toHaveLength(2);
        expect(result.result?.total).toBe(2);
      });

      it('should fetch orders for non-ad-spend channel successfully', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(false);

        const params = {
          ...baseParams,
          channel: 'organic-search',
        };

        const result = await service.getOrdersForAttribution(params);

        expect(result.success).toBe(true);
        expect(result.result?.orders).toHaveLength(2);
      });

      it('should handle empty orders result', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);
        mockClickHouseClient.query.mockResolvedValue({
          json: vi.fn().mockResolvedValue([]),
        });

        const result = await service.getOrdersForAttribution(baseParams);

        expect(result.success).toBe(true);
        expect(result.result?.orders).toHaveLength(0);
        expect(result.result?.total).toBe(0);
      });
    });

    describe('Attribution Models', () => {
      it('should use correct table for first_click model', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const params = {
          ...baseParams,
          attributionModel: 'first_click' as const,
        };

        await service.getOrdersForAttribution(params);

        const query = mockClickHouseClient.query.mock.calls[0][0].query;
        expect(query).toContain('int_first_click_attribution');
      });

      it('should use correct table for last_click model', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const params = {
          ...baseParams,
          attributionModel: 'last_click' as const,
        };

        await service.getOrdersForAttribution(params);

        const query = mockClickHouseClient.query.mock.calls[0][0].query;
        expect(query).toContain('int_last_click_attribution');
      });

      it('should use correct table for last_paid_click model', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        await service.getOrdersForAttribution(baseParams);

        const query = mockClickHouseClient.query.mock.calls[0][0].query;
        expect(query).toContain('int_last_paid_click_attribution');
      });
    });

    describe('Ad-Spend Channel Filters', () => {
      it('should include ad campaign filter', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const params = {
          ...baseParams,
          adCampaignPk: 'campaign-123',
        };

        await service.getOrdersForAttribution(params);

        const query = mockClickHouseClient.query.mock.calls[0][0].query;
        const queryParams = mockClickHouseClient.query.mock.calls[0][0].query_params;

        expect(query).toContain('ad_campaign_pk = {adCampaignPk: String}');
        expect(queryParams.adCampaignPk).toBe('campaign-123');
      });

      it('should include ad set filter', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const params = {
          ...baseParams,
          adSetPk: 'adset-456',
        };

        await service.getOrdersForAttribution(params);

        const query = mockClickHouseClient.query.mock.calls[0][0].query;
        const queryParams = mockClickHouseClient.query.mock.calls[0][0].query_params;

        expect(query).toContain('ad_set_pk = {adSetPk: String}');
        expect(queryParams.adSetPk).toBe('adset-456');
      });

      it('should include ad filter', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const params = {
          ...baseParams,
          adPk: 'ad-789',
        };

        await service.getOrdersForAttribution(params);

        const query = mockClickHouseClient.query.mock.calls[0][0].query;
        const queryParams = mockClickHouseClient.query.mock.calls[0][0].query_params;

        expect(query).toContain('ad_pk = {adPk: String}');
        expect(queryParams.adPk).toBe('ad-789');
      });

      it('should include all ad hierarchy filters', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const params = {
          ...baseParams,
          adCampaignPk: 'campaign-123',
          adSetPk: 'adset-456',
          adPk: 'ad-789',
        };

        await service.getOrdersForAttribution(params);

        const query = mockClickHouseClient.query.mock.calls[0][0].query;
        expect(query).toContain('ad_campaign_pk = {adCampaignPk: String}');
        expect(query).toContain('ad_set_pk = {adSetPk: String}');
        expect(query).toContain('ad_pk = {adPk: String}');
      });
    });

    describe('Non-Ad-Spend Channel Filters', () => {
      it('should include campaign filter for non-ad-spend channel', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(false);

        const params = {
          ...baseParams,
          channel: 'organic-search',
          campaign: 'summer-sale',
        };

        await service.getOrdersForAttribution(params);

        const query = mockClickHouseClient.query.mock.calls[0][0].query;
        const queryParams = mockClickHouseClient.query.mock.calls[0][0].query_params;

        expect(query).toContain('campaign = {campaign: String}');
        expect(queryParams.campaign).toBe('summer-sale');
      });

      it('should not include campaign filter when not provided', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(false);

        const params = {
          ...baseParams,
          channel: 'organic-search',
        };

        await service.getOrdersForAttribution(params);

        const query = mockClickHouseClient.query.mock.calls[0][0].query;
        expect(query).not.toContain('campaign = {campaign: String}');
      });
    });

    describe('First-Time Customers Filter', () => {
      it('should include first-time customers filter when requested', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const params = {
          ...baseParams,
          firstTimeCustomersOnly: true,
        };

        await service.getOrdersForAttribution(params);

        const query = mockClickHouseClient.query.mock.calls[0][0].query;
        expect(query).toContain('is_first_customer_order = 1');
      });

      it('should not include first-time customers filter when false', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const params = {
          ...baseParams,
          firstTimeCustomersOnly: false,
        };

        await service.getOrdersForAttribution(params);

        const query = mockClickHouseClient.query.mock.calls[0][0].query;
        expect(query).not.toContain('is_first_customer_order = 1');
      });

      it('should not include first-time customers filter when undefined', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        await service.getOrdersForAttribution(baseParams);

        const query = mockClickHouseClient.query.mock.calls[0][0].query;
        expect(query).not.toContain('is_first_customer_order = 1');
      });
    });

    describe('Query Construction', () => {
      it('should include all base query parameters', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        await service.getOrdersForAttribution(baseParams);

        const queryParams = mockClickHouseClient.query.mock.calls[0][0].query_params;

        expect(queryParams.shopName).toBe('test-shop.myshopify.com');
        expect(queryParams.startDate).toBe('2024-01-01');
        expect(queryParams.endDate).toBe('2024-01-31');
        expect(queryParams.attributionWindow).toBe('30');
        expect(queryParams.channel).toBe('meta-ads');
      });

      it('should use JSONEachRow format', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        await service.getOrdersForAttribution(baseParams);

        const format = mockClickHouseClient.query.mock.calls[0][0].format;
        expect(format).toBe('JSONEachRow');
      });

      it('should order by timestamp descending', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        await service.getOrdersForAttribution(baseParams);

        const query = mockClickHouseClient.query.mock.calls[0][0].query;
        expect(query).toContain('ORDER BY order_timestamp DESC, order_id');
      });
    });

    describe('Shop Resolution', () => {
      it('should resolve shop name from account ID', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        await service.getOrdersForAttribution(baseParams);

        expect(mockSupabaseClient.from).toHaveBeenCalledWith('shopify_shops');
        const selectCalls = mockSupabaseClient.from().select.mock.calls;
        expect(selectCalls[0][0]).toBe('shop_name');
      });

      it('should throw error when shop not found', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const supabaseChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Not found' },
          }),
        };

        mockSupabaseClient.from.mockReturnValue(supabaseChain);

        const result = await service.getOrdersForAttribution(baseParams);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Shop not found for account');
      });

      it('should throw error when shop data is null', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const supabaseChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(supabaseChain);

        const result = await service.getOrdersForAttribution(baseParams);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Shop not found for account');
      });
    });

    describe('Error Handling', () => {
      it('should return error response when ClickHouse query fails', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);
        mockClickHouseClient.query.mockRejectedValue(new Error('ClickHouse connection failed'));

        const result = await service.getOrdersForAttribution(baseParams);

        expect(result.success).toBe(false);
        expect(result.error).toBe('ClickHouse connection failed');
      });

      it('should handle unknown error types', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);
        mockClickHouseClient.query.mockRejectedValue('String error');

        const result = await service.getOrdersForAttribution(baseParams);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unknown error occurred');
      });
    });
  });
});
