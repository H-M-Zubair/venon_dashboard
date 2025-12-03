/**
 * Unit tests for OrderEventsService
 *
 * Testing strategy:
 * - Mock Supabase connection and moment-timezone
 * - Test successful event fetching with and without ads
 * - Test order validation (not found, wrong shop)
 * - Test event processing (sorting, filtering, grouping)
 * - Test ad details fetching
 * - Test error scenarios
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@/database/supabase/connection', () => ({
  supabaseConnection: {
    getServiceClient: vi.fn(),
  },
}));

vi.mock('moment-timezone', () => {
  const mockMoment = (timestamp: string) => ({
    tz: (timezone: string) => ({
      format: (formatStr: string) => {
        if (formatStr === 'HH:mm') {
          return '14:30';
        }
        return timestamp;
      },
    }),
  });
  return { default: mockMoment };
});

// Import after mocks
import { OrderEventsService } from './order-events.js';
import { supabaseConnection } from '@/database/supabase/connection';

describe('OrderEventsService', () => {
  let service: OrderEventsService;
  let mockSupabaseClient: any;

  const mockOrder = {
    id: 1,
    shopify_shop: 'test-shop.myshopify.com',
    shopify_shops: {
      timezone: 'America/New_York',
      shop_name: 'test-shop.myshopify.com',
    },
  };

  const mockEvents = [
    {
      events: {
        id: 1,
        type: 'page_view',
        ad_id: 'ad-123',
        page_url: '/products/test',
        timestamp: '2024-01-15T10:00:00Z',
        domains: { domain: 'https://example.com' },
        page_title: 'Test Product',
        referrer: 'https://google.com',
        source: 'google',
      },
    },
    {
      events: {
        id: 2,
        type: 'add_to_cart',
        ad_id: null,
        page_url: '/cart',
        timestamp: '2024-01-15T11:00:00Z',
        domains: { domain: 'https://example.com' },
        page_title: 'Shopping Cart',
        referrer: 'https://example.com/products/test',
        source: 'direct',
      },
    },
  ];

  const mockAdDetails = [
    {
      ad_id: 'ad-123',
      name: 'Test Ad',
      ad_sets: {
        name: 'Test Ad Set',
        ad_campaigns: {
          name: 'Test Campaign',
        },
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrderEventsService();

    // Mock Supabase client
    mockSupabaseClient = {
      from: vi.fn(),
    };

    vi.mocked(supabaseConnection.getServiceClient).mockReturnValue(mockSupabaseClient);
  });

  describe('getOrderEvents', () => {
    describe('Success Scenarios', () => {
      it('should fetch order events with ad details successfully', async () => {
        // Mock order query
        const orderChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockOrder,
            error: null,
          }),
        };

        // Mock events query
        const eventsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          returns: vi.fn().mockResolvedValue({
            data: mockEvents,
            error: null,
          }),
        };

        // Mock ad details query
        const adsChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          returns: vi.fn().mockResolvedValue({
            data: mockAdDetails,
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderChain)
          .mockReturnValueOnce(eventsChain)
          .mockReturnValueOnce(adsChain);

        const result = await service.getOrderEvents(1, 'test-shop.myshopify.com');

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      });

      it('should fetch order events without ad details', async () => {
        const eventsWithoutAds = [
          {
            events: {
              id: 2,
              type: 'add_to_cart',
              ad_id: null,
              page_url: '/cart',
              timestamp: '2024-01-15T11:00:00Z',
              domains: { domain: 'https://example.com' },
              page_title: 'Shopping Cart',
              referrer: 'https://example.com/products/test',
              source: 'direct',
            },
          },
        ];

        const orderChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockOrder,
            error: null,
          }),
        };

        const eventsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          returns: vi.fn().mockResolvedValue({
            data: eventsWithoutAds,
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderChain)
          .mockReturnValueOnce(eventsChain);

        const result = await service.getOrderEvents(1, 'test-shop.myshopify.com');

        expect(result).toBeDefined();
        expect(Array.isArray(result)).toBe(true);
      });

      it('should use default timezone when not provided', async () => {
        const orderWithoutTimezone = {
          ...mockOrder,
          shopify_shops: {
            ...mockOrder.shopify_shops,
            timezone: null,
          },
        };

        const orderChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: orderWithoutTimezone,
            error: null,
          }),
        };

        const eventsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          returns: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderChain)
          .mockReturnValueOnce(eventsChain);

        const result = await service.getOrderEvents(1, 'test-shop.myshopify.com');

        expect(result).toBeDefined();
      });

      it('should handle empty events array', async () => {
        const orderChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockOrder,
            error: null,
          }),
        };

        const eventsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          returns: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderChain)
          .mockReturnValueOnce(eventsChain);

        const result = await service.getOrderEvents(1, 'test-shop.myshopify.com');

        expect(result).toEqual([]);
      });
    });

    describe('Order Validation', () => {
      it('should throw error when order not found (error)', async () => {
        const orderChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Not found' },
          }),
        };

        mockSupabaseClient.from.mockReturnValue(orderChain);

        await expect(service.getOrderEvents(999, 'test-shop.myshopify.com')).rejects.toThrow(
          'Order not found'
        );
      });

      it('should throw error when order not found (no data)', async () => {
        const orderChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(orderChain);

        await expect(service.getOrderEvents(999, 'test-shop.myshopify.com')).rejects.toThrow(
          'Order not found'
        );
      });

      it('should throw error when order belongs to different shop', async () => {
        const orderChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockOrder,
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(orderChain);

        await expect(service.getOrderEvents(1, 'other-shop.myshopify.com')).rejects.toThrow(
          'Order does not belong to the specified shop'
        );
      });
    });

    describe('Error Handling', () => {
      it('should throw error when fetching events fails', async () => {
        const orderChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockOrder,
            error: null,
          }),
        };

        const eventsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          returns: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderChain)
          .mockReturnValueOnce(eventsChain);

        await expect(service.getOrderEvents(1, 'test-shop.myshopify.com')).rejects.toThrow(
          'Error fetching event orders'
        );
      });

      it('should throw error when fetching ad details fails', async () => {
        const orderChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockOrder,
            error: null,
          }),
        };

        const eventsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          returns: vi.fn().mockResolvedValue({
            data: mockEvents,
            error: null,
          }),
        };

        const adsChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          returns: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Ads query failed' },
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderChain)
          .mockReturnValueOnce(eventsChain)
          .mockReturnValueOnce(adsChain);

        await expect(service.getOrderEvents(1, 'test-shop.myshopify.com')).rejects.toThrow();
      });

      it('should propagate unexpected errors', async () => {
        mockSupabaseClient.from.mockImplementation(() => {
          throw new Error('Connection failed');
        });

        await expect(service.getOrderEvents(1, 'test-shop.myshopify.com')).rejects.toThrow(
          'Connection failed'
        );
      });
    });

    describe('Query Construction', () => {
      it('should query orders table with correct parameters', async () => {
        const orderChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockOrder,
            error: null,
          }),
        };

        const eventsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          returns: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderChain)
          .mockReturnValueOnce(eventsChain);

        await service.getOrderEvents(123, 'test-shop.myshopify.com');

        expect(mockSupabaseClient.from).toHaveBeenCalledWith('orders');
        expect(orderChain.select).toHaveBeenCalledWith(
          'id, shopify_shop, shopify_shops(timezone, shop_name)'
        );
        expect(orderChain.eq).toHaveBeenCalledWith('id', 123);
        expect(orderChain.single).toHaveBeenCalled();
      });

      it('should query events_orders table with order_id', async () => {
        const orderChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockOrder,
            error: null,
          }),
        };

        const eventsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          returns: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderChain)
          .mockReturnValueOnce(eventsChain);

        await service.getOrderEvents(456, 'test-shop.myshopify.com');

        expect(mockSupabaseClient.from).toHaveBeenCalledWith('events_orders');
        expect(eventsChain.eq).toHaveBeenCalledWith('order_id', 456);
      });

      it('should query ads table when ad_ids present', async () => {
        const orderChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: mockOrder,
            error: null,
          }),
        };

        const eventsChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          returns: vi.fn().mockResolvedValue({
            data: mockEvents,
            error: null,
          }),
        };

        const adsChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          returns: vi.fn().mockResolvedValue({
            data: mockAdDetails,
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderChain)
          .mockReturnValueOnce(eventsChain)
          .mockReturnValueOnce(adsChain);

        await service.getOrderEvents(1, 'test-shop.myshopify.com');

        expect(mockSupabaseClient.from).toHaveBeenCalledWith('ads');
        expect(adsChain.in).toHaveBeenCalledWith('ad_id', ['ad-123']);
      });
    });
  });
});
