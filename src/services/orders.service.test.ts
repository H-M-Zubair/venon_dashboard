/**
 * Unit tests for OrdersService
 *
 * Testing strategy:
 * - Mock Supabase connection
 * - Test getRecentOrdersByShop with various scenarios
 * - Test getShopTimezone with success and error scenarios
 * - Verify data transformation and timezone handling
 * - Test error scenarios
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@/database/supabase/connection.js', () => ({
  supabaseConnection: {
    getServiceClient: vi.fn(),
  },
}));

vi.mock('moment-timezone', () => {
  const mockMoment = (dateStr: string) => ({
    tz: (timezone: string) => ({
      format: (formatStr: string) => {
        // Simple mock: return a fixed time for testing
        if (formatStr === 'HH:mm') {
          return '14:30';
        }
        return dateStr;
      },
    }),
  });
  return { default: mockMoment };
});

// Import after mocks
import { OrdersService } from './orders.js';
import { supabaseConnection } from '@/database/supabase/connection.js';

describe('OrdersService', () => {
  let service: OrdersService;
  let mockSupabaseClient: any;

  const mockOrderIds = [
    { id: 'order-1' },
    { id: 'order-2' },
  ];

  const mockOrders = [
    {
      id: 'order-1',
      name: '#1001',
      total_price: 99.99,
      customer_first_name: 'John',
      customer_last_name: 'Doe',
      created_at: '2024-01-15T14:30:00Z',
      events: [
        { referrer: 'google.com', source: 'google' },
        { referrer: 'facebook.com', source: 'facebook' },
      ],
    },
    {
      id: 'order-2',
      name: '#1002',
      total_price: 149.50,
      customer_first_name: 'Jane',
      customer_last_name: 'Smith',
      created_at: '2024-01-15T15:45:00Z',
      events: [
        { referrer: null, source: 'direct' },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrdersService();

    mockSupabaseClient = {
      from: vi.fn(),
    };

    vi.mocked(supabaseConnection.getServiceClient).mockReturnValue(mockSupabaseClient);
  });

  describe('getRecentOrdersByShop', () => {
    describe('Success Scenarios', () => {
      it('should fetch and format recent orders successfully', async () => {
        // Mock order IDs query
        const orderIdsChain = {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: mockOrderIds,
            error: null,
          }),
        };

        // Mock orders details query
        const ordersChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockOrders,
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderIdsChain)
          .mockReturnValueOnce(ordersChain);

        const result = await service.getRecentOrdersByShop(
          'test-shop.myshopify.com',
          '2024-01-01',
          '2024-01-31',
          'America/New_York'
        );

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          id: 'order-1',
          name: '#1001',
          customerFirstName: 'John',
          customerLastName: 'Doe',
          time: '14:30',
          totalPrice: 99.99,
          sources: ['google', 'facebook'],
        });
      });

      it('should return empty array when no orders found', async () => {
        const orderIdsChain = {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(orderIdsChain);

        const result = await service.getRecentOrdersByShop(
          'empty-shop.myshopify.com',
          '2024-01-01',
          '2024-01-31',
          'UTC'
        );

        expect(result).toEqual([]);
      });

      it('should return empty array when order IDs data is null', async () => {
        const orderIdsChain = {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(orderIdsChain);

        const result = await service.getRecentOrdersByShop(
          'test-shop.myshopify.com',
          '2024-01-01',
          '2024-01-31',
          'UTC'
        );

        expect(result).toEqual([]);
      });

      it('should handle orders with null customer names', async () => {
        const orderWithNullNames = {
          ...mockOrders[0],
          customer_first_name: null,
          customer_last_name: null,
        };

        const orderIdsChain = {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [{ id: 'order-1' }],
            error: null,
          }),
        };

        const ordersChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [orderWithNullNames],
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderIdsChain)
          .mockReturnValueOnce(ordersChain);

        const result = await service.getRecentOrdersByShop(
          'test-shop.myshopify.com',
          '2024-01-01',
          '2024-01-31',
          'UTC'
        );

        expect(result[0].customerFirstName).toBeNull();
        expect(result[0].customerLastName).toBeNull();
      });

      it('should handle orders with no events', async () => {
        const orderWithNoEvents = {
          ...mockOrders[0],
          events: [],
        };

        const orderIdsChain = {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [{ id: 'order-1' }],
            error: null,
          }),
        };

        const ordersChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [orderWithNoEvents],
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderIdsChain)
          .mockReturnValueOnce(ordersChain);

        const result = await service.getRecentOrdersByShop(
          'test-shop.myshopify.com',
          '2024-01-01',
          '2024-01-31',
          'UTC'
        );

        expect(result[0].sources).toEqual([]);
      });

      it('should handle events with null sources', async () => {
        const orderWithNullSources = {
          ...mockOrders[0],
          events: [
            { referrer: 'google.com', source: null },
            { referrer: 'facebook.com', source: 'facebook' },
          ],
        };

        const orderIdsChain = {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [{ id: 'order-1' }],
            error: null,
          }),
        };

        const ordersChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [orderWithNullSources],
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderIdsChain)
          .mockReturnValueOnce(ordersChain);

        const result = await service.getRecentOrdersByShop(
          'test-shop.myshopify.com',
          '2024-01-01',
          '2024-01-31',
          'UTC'
        );

        expect(result[0].sources).toEqual(['facebook']);
      });

      it('should remove duplicate sources', async () => {
        const orderWithDuplicateSources = {
          ...mockOrders[0],
          events: [
            { referrer: 'google.com', source: 'google' },
            { referrer: 'google.com/search', source: 'google' },
            { referrer: 'facebook.com', source: 'facebook' },
          ],
        };

        const orderIdsChain = {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [{ id: 'order-1' }],
            error: null,
          }),
        };

        const ordersChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [orderWithDuplicateSources],
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderIdsChain)
          .mockReturnValueOnce(ordersChain);

        const result = await service.getRecentOrdersByShop(
          'test-shop.myshopify.com',
          '2024-01-01',
          '2024-01-31',
          'UTC'
        );

        expect(result[0].sources).toEqual(['google', 'facebook']);
      });
    });

    describe('Query Construction', () => {
      it('should query orders with correct parameters', async () => {
        const orderIdsChain = {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(orderIdsChain);

        await service.getRecentOrdersByShop(
          'my-shop.myshopify.com',
          '2024-01-01',
          '2024-01-31',
          'America/New_York'
        );

        expect(mockSupabaseClient.from).toHaveBeenCalledWith('orders');
        expect(orderIdsChain.select).toHaveBeenCalledWith('id, shopify_shops!inner ( shop_name )');
        expect(orderIdsChain.gte).toHaveBeenCalledWith('created_at', '2024-01-01');
        expect(orderIdsChain.lte).toHaveBeenCalledWith('created_at', '2024-01-31');
        expect(orderIdsChain.eq).toHaveBeenCalledWith('shopify_shops.shop_name', 'my-shop.myshopify.com');
        expect(orderIdsChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
        expect(orderIdsChain.limit).toHaveBeenCalledWith(10);
      });

      it('should query order details with correct IDs', async () => {
        const orderIdsChain = {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: mockOrderIds,
            error: null,
          }),
        };

        const ordersChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: mockOrders,
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderIdsChain)
          .mockReturnValueOnce(ordersChain);

        await service.getRecentOrdersByShop(
          'test-shop.myshopify.com',
          '2024-01-01',
          '2024-01-31',
          'UTC'
        );

        expect(ordersChain.in).toHaveBeenCalledWith('id', ['order-1', 'order-2']);
        expect(ordersChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      });
    });

    describe('Error Handling', () => {
      it('should throw error when order IDs fetch fails', async () => {
        const orderIdsChain = {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        };

        mockSupabaseClient.from.mockReturnValue(orderIdsChain);

        await expect(
          service.getRecentOrdersByShop(
            'test-shop.myshopify.com',
            '2024-01-01',
            '2024-01-31',
            'UTC'
          )
        ).rejects.toEqual({ message: 'Database error' });
      });

      it('should throw error when order details fetch fails', async () => {
        const orderIdsChain = {
          select: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: mockOrderIds,
            error: null,
          }),
        };

        const ordersChain = {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Failed to fetch details' },
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(orderIdsChain)
          .mockReturnValueOnce(ordersChain);

        await expect(
          service.getRecentOrdersByShop(
            'test-shop.myshopify.com',
            '2024-01-01',
            '2024-01-31',
            'UTC'
          )
        ).rejects.toEqual({ message: 'Failed to fetch details' });
      });
    });
  });

  describe('getShopTimezone', () => {
    describe('Success Scenarios', () => {
      it('should fetch shop timezone successfully', async () => {
        const timezoneChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { timezone: 'America/New_York' },
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(timezoneChain);

        const result = await service.getShopTimezone('test-shop.myshopify.com');

        expect(result).toBe('America/New_York');
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('shopify_shops');
        expect(timezoneChain.select).toHaveBeenCalledWith('timezone');
        expect(timezoneChain.eq).toHaveBeenCalledWith('shop_name', 'test-shop.myshopify.com');
      });
    });

    describe('Error Handling and Defaults', () => {
      it('should return UTC when timezone fetch fails', async () => {
        const timezoneChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Shop not found' },
          }),
        };

        mockSupabaseClient.from.mockReturnValue(timezoneChain);

        const result = await service.getShopTimezone('nonexistent-shop.myshopify.com');

        expect(result).toBe('UTC');
      });

      it('should return UTC when data is null', async () => {
        const timezoneChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(timezoneChain);

        const result = await service.getShopTimezone('test-shop.myshopify.com');

        expect(result).toBe('UTC');
      });

      it('should return UTC when timezone field is null', async () => {
        const timezoneChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { timezone: null },
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(timezoneChain);

        const result = await service.getShopTimezone('test-shop.myshopify.com');

        expect(result).toBe('UTC');
      });

      it('should return UTC when timezone field is undefined', async () => {
        const timezoneChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {},
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(timezoneChain);

        const result = await service.getShopTimezone('test-shop.myshopify.com');

        expect(result).toBe('UTC');
      });
    });
  });
});
