/**
 * Unit tests for EventBasedOrdersAttributionService
 *
 * Testing strategy:
 * - Mock ClickHouse connection and helper functions
 * - Test all attribution models (first_click, last_click, last_paid_click, linear_all, linear_paid)
 * - Test with ad-spend vs non-ad-spend channels
 * - Test optional filters (ad hierarchy for ad-spend, campaign for non-ad-spend)
 * - Test firstTimeCustomersOnly filter
 * - Verify query generation and parameter handling
 * - Test error scenarios
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the service
vi.mock('@/database/clickhouse/connection.js', () => ({
  clickhouseConnection: {
    getClient: vi.fn(),
  },
}));

vi.mock('@/utils/account-helpers.js', () => ({
  getShopNameFromAccountId: vi.fn(),
}));

vi.mock('@/utils/date-helpers.js', () => ({
  makeEndDateInclusiveAndFormat: vi.fn((date: Date) => {
    const inclusive = new Date(date);
    inclusive.setDate(inclusive.getDate() + 1);
    return inclusive.toISOString().split('T')[0];
  }),
}));

vi.mock('@/config/channels.js', () => ({
  isAdSpendChannel: vi.fn(),
}));

// Import after mocks
import { clickhouseConnection } from '@/database/clickhouse/connection.js';
import { getShopNameFromAccountId } from '@/utils/account-helpers.js';
import { makeEndDateInclusiveAndFormat } from '@/utils/date-helpers.js';
import { isAdSpendChannel } from '@/config/channels.js';
import { EventBasedOrdersAttributionService } from './event-based-orders-attribution.js';
import { EventBasedOrdersAttributionRequest, OrderInfo } from '@/types/orders-attribution.js';

describe('EventBasedOrdersAttributionService', () => {
  let service: EventBasedOrdersAttributionService;
  let mockClickHouseClient: any;

  const mockOrders: OrderInfo[] = [
    {
      order_id: 'order-123',
      order_number: '1001',
      order_timestamp: '2024-01-15T10:00:00Z',
      is_first_customer_order: true,
    },
    {
      order_id: 'order-456',
      order_number: '1002',
      order_timestamp: '2024-01-16T14:30:00Z',
      is_first_customer_order: false,
    },
    {
      order_id: 'order-789',
      order_number: '1003',
      order_timestamp: '2024-01-17T09:15:00Z',
      is_first_customer_order: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EventBasedOrdersAttributionService();

    // Mock ClickHouse client
    mockClickHouseClient = {
      query: vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue(mockOrders),
      }),
    };

    vi.mocked(clickhouseConnection.getClient).mockReturnValue(mockClickHouseClient);
    vi.mocked(getShopNameFromAccountId).mockResolvedValue('test-shop.myshopify.com');
    vi.mocked(makeEndDateInclusiveAndFormat).mockReturnValue('2024-01-21');
  });

  describe('getOrdersForEventAttribution', () => {
    const baseParams: EventBasedOrdersAttributionRequest = {
      accountId: 'account-123',
      startDate: '2024-01-01',
      endDate: '2024-01-20',
      attributionModel: 'first_click',
      channel: 'meta-ads',
    };

    describe('Attribution Models', () => {
      it('should handle first_click attribution model', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const result = await service.getOrdersForEventAttribution({
          ...baseParams,
          attributionModel: 'first_click',
        });

        expect(result.success).toBe(true);
        expect(result.result?.orders).toHaveLength(3);
        expect(mockClickHouseClient.query).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.stringContaining('is_first_event_overall = TRUE'),
          })
        );
      });

      it('should handle last_click attribution model', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const result = await service.getOrdersForEventAttribution({
          ...baseParams,
          attributionModel: 'last_click',
        });

        expect(result.success).toBe(true);
        expect(result.result?.orders).toHaveLength(3);
        expect(mockClickHouseClient.query).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.stringContaining('is_last_event_overall = TRUE'),
          })
        );
      });

      it('should handle last_paid_click attribution model', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const result = await service.getOrdersForEventAttribution({
          ...baseParams,
          attributionModel: 'last_paid_click',
        });

        expect(result.success).toBe(true);
        expect(result.result?.orders).toHaveLength(3);
        expect(mockClickHouseClient.query).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.stringContaining('is_last_paid_event_overall = TRUE'),
          })
        );
      });

      it('should handle linear_all attribution model', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const result = await service.getOrdersForEventAttribution({
          ...baseParams,
          attributionModel: 'linear_all',
        });

        expect(result.success).toBe(true);
        expect(result.result?.orders).toHaveLength(3);
        // Linear all doesn't filter by event position flags
        const query = mockClickHouseClient.query.mock.calls[0][0].query;
        expect(query).not.toContain('is_first_event_overall');
        expect(query).not.toContain('is_last_event_overall');
      });

      it('should handle linear_paid attribution model', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const result = await service.getOrdersForEventAttribution({
          ...baseParams,
          attributionModel: 'linear_paid',
        });

        expect(result.success).toBe(true);
        expect(result.result?.orders).toHaveLength(3);
        expect(mockClickHouseClient.query).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.stringContaining('is_paid_channel = TRUE'),
          })
        );
      });
    });

    describe('Channel Types', () => {
      it('should handle ad-spend channel with ad hierarchy filters', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const result = await service.getOrdersForEventAttribution({
          ...baseParams,
          attributionModel: 'first_click',
          channel: 'meta-ads',
          adCampaignPk: 'campaign-123',
          adSetPk: 'adset-456',
          adPk: 'ad-789',
        });

        expect(result.success).toBe(true);
        expect(mockClickHouseClient.query).toHaveBeenCalledWith(
          expect.objectContaining({
            query_params: expect.objectContaining({
              shopName: 'test-shop.myshopify.com',
              channel: 'meta-ads',
              adCampaignPk: 'campaign-123',
              adSetPk: 'adset-456',
              adPk: 'ad-789',
            }),
          })
        );
        expect(mockClickHouseClient.query).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.stringContaining('ad_campaign_pk = {adCampaignPk: String}'),
          })
        );
      });

      it('should handle non-ad-spend channel with campaign filter', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(false);

        const result = await service.getOrdersForEventAttribution({
          ...baseParams,
          attributionModel: 'first_click',
          channel: 'organic-search',
          campaign: 'summer-sale',
        });

        expect(result.success).toBe(true);
        expect(mockClickHouseClient.query).toHaveBeenCalledWith(
          expect.objectContaining({
            query_params: expect.objectContaining({
              shopName: 'test-shop.myshopify.com',
              channel: 'organic-search',
              campaign: 'summer-sale',
            }),
          })
        );
        expect(mockClickHouseClient.query).toHaveBeenCalledWith(
          expect.objectContaining({
            query: expect.stringContaining('campaign = {campaign: String}'),
          })
        );
      });

      it('should handle ad-spend channel with partial ad hierarchy filters', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const result = await service.getOrdersForEventAttribution({
          ...baseParams,
          attributionModel: 'first_click',
          channel: 'google-ads',
          adCampaignPk: 'campaign-123',
        });

        expect(result.success).toBe(true);
        expect(mockClickHouseClient.query).toHaveBeenCalledWith(
          expect.objectContaining({
            query_params: expect.objectContaining({
              adCampaignPk: 'campaign-123',
            }),
          })
        );
        // Should not include adSetPk or adPk in params
        const queryParams = mockClickHouseClient.query.mock.calls[0][0].query_params;
        expect(queryParams.adSetPk).toBeUndefined();
        expect(queryParams.adPk).toBeUndefined();
      });

      it('should handle ad-spend channel without any filters', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const result = await service.getOrdersForEventAttribution({
          ...baseParams,
          attributionModel: 'first_click',
          channel: 'meta-ads',
        });

        expect(result.success).toBe(true);
        const queryParams = mockClickHouseClient.query.mock.calls[0][0].query_params;
        expect(queryParams.adCampaignPk).toBeUndefined();
        expect(queryParams.adSetPk).toBeUndefined();
        expect(queryParams.adPk).toBeUndefined();
      });
    });

    describe('First-Time Customers Filter', () => {
      it('should filter for first-time customers when requested', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const result = await service.getOrdersForEventAttribution({
          ...baseParams,
          firstTimeCustomersOnly: true,
        });

        expect(result.success).toBe(true);
        expect(result.result?.orders).toHaveLength(2); // Only orders with is_first_customer_order = true
        expect(result.result?.orders.every((order) => order.is_first_customer_order)).toBe(true);
      });

      it('should return all orders when firstTimeCustomersOnly is false', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const result = await service.getOrdersForEventAttribution({
          ...baseParams,
          firstTimeCustomersOnly: false,
        });

        expect(result.success).toBe(true);
        expect(result.result?.orders).toHaveLength(3);
      });

      it('should return all orders when firstTimeCustomersOnly is not provided', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const result = await service.getOrdersForEventAttribution(baseParams);

        expect(result.success).toBe(true);
        expect(result.result?.orders).toHaveLength(3);
      });

      it('should handle is_first_customer_order as numeric 0/1', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        // Mock orders with numeric boolean values (as ClickHouse returns them)
        const numericOrders = [
          { ...mockOrders[0], is_first_customer_order: 1 as any },
          { ...mockOrders[1], is_first_customer_order: 0 as any },
          { ...mockOrders[2], is_first_customer_order: 1 as any },
        ];
        mockClickHouseClient.query.mockResolvedValue({
          json: vi.fn().mockResolvedValue(numericOrders),
        });

        const result = await service.getOrdersForEventAttribution({
          ...baseParams,
          firstTimeCustomersOnly: true,
        });

        expect(result.success).toBe(true);
        expect(result.result?.orders).toHaveLength(2);
      });
    });

    describe('Date Handling', () => {
      it('should make end date inclusive', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);
        vi.mocked(makeEndDateInclusiveAndFormat).mockReturnValue('2024-01-21');

        await service.getOrdersForEventAttribution(baseParams);

        expect(makeEndDateInclusiveAndFormat).toHaveBeenCalledWith(new Date('2024-01-20'));
        expect(mockClickHouseClient.query).toHaveBeenCalledWith(
          expect.objectContaining({
            query_params: expect.objectContaining({
              endDate: '2024-01-21',
            }),
          })
        );
      });

      it('should use start date as provided', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        await service.getOrdersForEventAttribution(baseParams);

        expect(mockClickHouseClient.query).toHaveBeenCalledWith(
          expect.objectContaining({
            query_params: expect.objectContaining({
              startDate: '2024-01-01',
            }),
          })
        );
      });
    });

    describe('Account and Shop Resolution', () => {
      it('should resolve shop name from account ID', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);
        vi.mocked(getShopNameFromAccountId).mockResolvedValue('my-store.myshopify.com');

        await service.getOrdersForEventAttribution(baseParams);

        expect(getShopNameFromAccountId).toHaveBeenCalledWith('account-123');
        expect(mockClickHouseClient.query).toHaveBeenCalledWith(
          expect.objectContaining({
            query_params: expect.objectContaining({
              shopName: 'my-store.myshopify.com',
            }),
          })
        );
      });
    });

    describe('Response Structure', () => {
      it('should return success response with orders and total', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        const result = await service.getOrdersForEventAttribution(baseParams);

        expect(result).toEqual({
          success: true,
          result: {
            orders: mockOrders,
            total: 3,
          },
        });
      });

      it('should return empty orders when no orders found', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);
        mockClickHouseClient.query.mockResolvedValue({
          json: vi.fn().mockResolvedValue([]),
        });

        const result = await service.getOrdersForEventAttribution(baseParams);

        expect(result.success).toBe(true);
        expect(result.result?.orders).toHaveLength(0);
        expect(result.result?.total).toBe(0);
      });
    });

    describe('Error Handling', () => {
      it('should handle shop name resolution failure', async () => {
        vi.mocked(getShopNameFromAccountId).mockRejectedValue(
          new Error('Shop not found for account')
        );

        const result = await service.getOrdersForEventAttribution(baseParams);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Shop not found for account');
      });

      it('should handle ClickHouse query failure', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);
        mockClickHouseClient.query.mockRejectedValue(new Error('ClickHouse connection error'));

        const result = await service.getOrdersForEventAttribution(baseParams);

        expect(result.success).toBe(false);
        expect(result.error).toBe('ClickHouse connection error');
      });

      it('should handle unknown error types', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);
        mockClickHouseClient.query.mockRejectedValue('String error');

        const result = await service.getOrdersForEventAttribution(baseParams);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unknown error occurred');
      });
    });

    describe('Query Format', () => {
      it('should use JSONEachRow format', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        await service.getOrdersForEventAttribution(baseParams);

        expect(mockClickHouseClient.query).toHaveBeenCalledWith(
          expect.objectContaining({
            format: 'JSONEachRow',
          })
        );
      });

      it('should include all required query parameters', async () => {
        vi.mocked(isAdSpendChannel).mockReturnValue(true);

        await service.getOrdersForEventAttribution(baseParams);

        expect(mockClickHouseClient.query).toHaveBeenCalledWith(
          expect.objectContaining({
            query_params: expect.objectContaining({
              shopName: expect.any(String),
              startDate: expect.any(String),
              endDate: expect.any(String),
              channel: expect.any(String),
            }),
          })
        );
      });
    });
  });

  describe('Query Generation Methods', () => {
    beforeEach(() => {
      service = new EventBasedOrdersAttributionService();
    });

    describe('buildFirstClickQuery', () => {
      it('should generate query with is_first_event_overall flag', () => {
        const query = (service as any).buildFirstClickQuery('');

        expect(query).toContain('is_first_event_overall = TRUE');
        expect(query).toContain('ORDER BY order_timestamp DESC, order_id');
      });

      it('should include optional filters', () => {
        const optionalFilters = 'AND ad_campaign_pk = {adCampaignPk: String}';
        const query = (service as any).buildFirstClickQuery(optionalFilters);

        expect(query).toContain(optionalFilters);
      });
    });

    describe('buildLastClickQuery', () => {
      it('should generate query with is_last_event_overall flag', () => {
        const query = (service as any).buildLastClickQuery('');

        expect(query).toContain('is_last_event_overall = TRUE');
        expect(query).toContain('ORDER BY order_timestamp DESC, order_id');
      });
    });

    describe('buildLastPaidClickQuery', () => {
      it('should generate query with is_last_paid_event_overall flag', () => {
        const query = (service as any).buildLastPaidClickQuery('');

        expect(query).toContain('is_last_paid_event_overall = TRUE');
        expect(query).toContain('has_any_paid_events = TRUE');
      });

      it('should include fallback to last event for orders without paid events', () => {
        const query = (service as any).buildLastPaidClickQuery('');

        expect(query).toContain('is_last_event_overall = TRUE AND has_any_paid_events = FALSE');
      });
    });

    describe('buildLinearAllQuery', () => {
      it('should generate query without event position flags', () => {
        const query = (service as any).buildLinearAllQuery('');

        expect(query).not.toContain('is_first_event_overall');
        expect(query).not.toContain('is_last_event_overall');
        expect(query).toContain('channel = {channel: String}');
      });
    });

    describe('buildLinearPaidQuery', () => {
      it('should generate query filtering for paid channels', () => {
        const query = (service as any).buildLinearPaidQuery('');

        expect(query).toContain('is_paid_channel = TRUE');
      });

      it('should include fallback for orders with no paid events', () => {
        const query = (service as any).buildLinearPaidQuery('');

        expect(query).toContain('order_id NOT IN');
        expect(query).toContain('is_paid_channel = TRUE');
      });
    });
  });

  describe('buildOptionalFilterConditions', () => {
    beforeEach(() => {
      service = new EventBasedOrdersAttributionService();
    });

    it('should build filters for ad-spend channel with all ad hierarchy', () => {
      const params: EventBasedOrdersAttributionRequest = {
        accountId: 'account-123',
        startDate: '2024-01-01',
        endDate: '2024-01-20',
        attributionModel: 'first_click',
        channel: 'meta-ads',
        adCampaignPk: 'campaign-123',
        adSetPk: 'adset-456',
        adPk: 'ad-789',
      };

      const filters = (service as any).buildOptionalFilterConditions(params, true);

      expect(filters).toContain('ad_campaign_pk = {adCampaignPk: String}');
      expect(filters).toContain('ad_set_pk = {adSetPk: String}');
      expect(filters).toContain('ad_pk = {adPk: String}');
    });

    it('should build filters for ad-spend channel with only campaign', () => {
      const params: EventBasedOrdersAttributionRequest = {
        accountId: 'account-123',
        startDate: '2024-01-01',
        endDate: '2024-01-20',
        attributionModel: 'first_click',
        channel: 'google-ads',
        adCampaignPk: 'campaign-123',
      };

      const filters = (service as any).buildOptionalFilterConditions(params, true);

      expect(filters).toContain('ad_campaign_pk = {adCampaignPk: String}');
      expect(filters).not.toContain('ad_set_pk');
      expect(filters).not.toContain('ad_pk');
    });

    it('should build filters for non-ad-spend channel with campaign', () => {
      const params: EventBasedOrdersAttributionRequest = {
        accountId: 'account-123',
        startDate: '2024-01-01',
        endDate: '2024-01-20',
        attributionModel: 'first_click',
        channel: 'organic-search',
        campaign: 'summer-sale',
      };

      const filters = (service as any).buildOptionalFilterConditions(params, false);

      expect(filters).toContain('campaign = {campaign: String}');
      expect(filters).not.toContain('ad_campaign_pk');
    });

    it('should return empty string when no optional filters provided', () => {
      const params: EventBasedOrdersAttributionRequest = {
        accountId: 'account-123',
        startDate: '2024-01-01',
        endDate: '2024-01-20',
        attributionModel: 'first_click',
        channel: 'direct',
      };

      const filters = (service as any).buildOptionalFilterConditions(params, false);

      expect(filters).toBe('');
    });
  });

  describe('buildQueryForModel', () => {
    beforeEach(() => {
      service = new EventBasedOrdersAttributionService();
    });

    it('should call buildFirstClickQuery for first_click model', () => {
      const query = (service as any).buildQueryForModel('first_click', '');
      expect(query).toContain('is_first_event_overall = TRUE');
    });

    it('should call buildLastClickQuery for last_click model', () => {
      const query = (service as any).buildQueryForModel('last_click', '');
      expect(query).toContain('is_last_event_overall = TRUE');
    });

    it('should call buildLastPaidClickQuery for last_paid_click model', () => {
      const query = (service as any).buildQueryForModel('last_paid_click', '');
      expect(query).toContain('is_last_paid_event_overall = TRUE');
    });

    it('should call buildLinearAllQuery for linear_all model', () => {
      const query = (service as any).buildQueryForModel('linear_all', '');
      expect(query).not.toContain('is_first_event_overall');
      expect(query).not.toContain('is_last_event_overall');
    });

    it('should call buildLinearPaidQuery for linear_paid model', () => {
      const query = (service as any).buildQueryForModel('linear_paid', '');
      expect(query).toContain('is_paid_channel = TRUE');
    });

    it('should throw error for unknown attribution model', () => {
      expect(() => {
        (service as any).buildQueryForModel('invalid_model', '');
      }).toThrow('Unknown attribution model: invalid_model');
    });
  });
});
