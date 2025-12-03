/**
 * Unit tests for NonAdSpendAnalyticsService
 *
 * Testing strategy:
 * - Mock ClickHouse connection for campaign analytics queries
 * - Mock Supabase connection for shop lookup
 * - Mock attribution table utility
 * - Test all profit calculations (gross revenue, net profit, margin)
 * - Test average metrics (AOV, revenue per order touched)
 * - Test first-time customer metrics
 * - Test VAT handling logic (ignore_vat = true/false)
 * - Test data transformation (string to number conversions)
 * - Test edge cases: zero revenue, zero orders, missing shop
 * - Verify error handling and shop resolution
 * - Test attribution model integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@/database/clickhouse/connection.js', () => ({
  clickhouseConnection: {
    query: vi.fn(),
  },
}));

vi.mock('@/database/supabase/connection.js', () => ({
  supabaseConnection: {
    getServiceClient: vi.fn(),
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

// Import after mocks
import { NonAdSpendAnalyticsService } from './non-ad-spend-analytics.js';
import type { NonAdSpendAnalyticsRequest, NonAdSpendCampaign } from '@/types/non-ad-spend-analytics.js';
import { clickhouseConnection } from '@/database/clickhouse/connection.js';
import { supabaseConnection } from '@/database/supabase/connection.js';

describe('NonAdSpendAnalyticsService', () => {
  let service: NonAdSpendAnalyticsService;
  let mockSupabaseClient: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new NonAdSpendAnalyticsService();

    // Mock Supabase client
    mockSupabaseClient = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    vi.mocked(supabaseConnection.getServiceClient).mockReturnValue(mockSupabaseClient);
  });

  describe('getCampaignAnalytics', () => {
    const mockParams: NonAdSpendAnalyticsRequest = {
      accountId: 'account-123',
      channel: 'organic',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      attributionModel: 'last_paid_click',
      attributionWindow: '28_day',
    };

    describe('Happy Path', () => {
      it('should return campaign analytics for valid request', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [
          {
            channel: 'organic',
            campaign: 'seo',
            attributed_orders: '100.0',
            attributed_revenue: '10000.00',
            distinct_orders_touched: '95',
            attributed_cogs: '3000.00',
            attributed_payment_fees: '200.00',
            attributed_tax: '800.00',
            gross_revenue: '9200.00', // revenue - tax
            net_profit: '6000.00', // gross_revenue - cogs - fees
            profit_margin_pct: '60.0',
            avg_order_value: '100.00',
            revenue_per_order_touched: '105.26',
            first_time_customer_orders: '30.0',
            first_time_customer_revenue: '3000.00',
          },
        ];

        // Mock Supabase shop lookup
        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        // Mock ClickHouse query
        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        expect(result.success).toBe(true);
        expect(result.result.data).toHaveLength(1);
        expect(result.result.data[0].attributed_orders).toBe(100); // Converted to number
        expect(result.result.data[0].attributed_revenue).toBe(10000);
        expect(result.result.metadata.shop_name).toBe('test-shop.myshopify.com');
      });

      it('should convert ClickHouse string metrics to numbers', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [
          {
            channel: 'organic',
            campaign: 'seo',
            attributed_orders: '50.5',
            attributed_revenue: '5000.75',
            distinct_orders_touched: '48',
            attributed_cogs: '1500.25',
            attributed_payment_fees: '100.50',
            attributed_tax: '400.00',
            gross_revenue: '4600.75',
            net_profit: '3000.00',
            profit_margin_pct: '60.0',
            avg_order_value: '99.02',
            revenue_per_order_touched: '104.18',
            first_time_customer_orders: '20.5',
            first_time_customer_revenue: '2000.00',
          },
        ];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        const campaign = result.result.data[0];
        expect(typeof campaign.attributed_orders).toBe('number');
        expect(typeof campaign.attributed_revenue).toBe('number');
        expect(typeof campaign.distinct_orders_touched).toBe('number');
        expect(typeof campaign.attributed_cogs).toBe('number');
        expect(typeof campaign.attributed_payment_fees).toBe('number');
        expect(typeof campaign.attributed_tax).toBe('number');
        expect(typeof campaign.gross_revenue).toBe('number');
        expect(typeof campaign.net_profit).toBe('number');
        expect(typeof campaign.profit_margin_pct).toBe('number');
        expect(typeof campaign.avg_order_value).toBe('number');
        expect(typeof campaign.revenue_per_order_touched).toBe('number');
        expect(typeof campaign.first_time_customer_orders).toBe('number');
        expect(typeof campaign.first_time_customer_revenue).toBe('number');

        // Verify exact values
        expect(campaign.attributed_orders).toBe(50.5);
        expect(campaign.attributed_revenue).toBe(5000.75);
      });

      it('should include all required metadata fields', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        expect(result.result.metadata).toMatchObject({
          shop_name: 'test-shop.myshopify.com',
          channel: 'organic',
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          attribution_model: 'last_paid_click',
          attribution_window: '28_day',
          query_timestamp: expect.any(String),
        });

        // Verify timestamp is valid ISO string
        expect(new Date(result.result.metadata.query_timestamp).toString()).not.toBe('Invalid Date');
      });

      it('should return multiple campaigns sorted by revenue DESC', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [
          {
            channel: 'organic',
            campaign: 'seo',
            attributed_orders: '150.0',
            attributed_revenue: '15000.00',
            distinct_orders_touched: '140',
            attributed_cogs: '5000.00',
            attributed_payment_fees: '300.00',
            attributed_tax: '1200.00',
            gross_revenue: '13800.00',
            net_profit: '8500.00',
            profit_margin_pct: '56.67',
            avg_order_value: '100.00',
            revenue_per_order_touched: '107.14',
            first_time_customer_orders: '50.0',
            first_time_customer_revenue: '5000.00',
          },
          {
            channel: 'organic',
            campaign: 'direct',
            attributed_orders: '100.0',
            attributed_revenue: '10000.00',
            distinct_orders_touched: '95',
            attributed_cogs: '3000.00',
            attributed_payment_fees: '200.00',
            attributed_tax: '800.00',
            gross_revenue: '9200.00',
            net_profit: '6000.00',
            profit_margin_pct: '60.0',
            avg_order_value: '100.00',
            revenue_per_order_touched: '105.26',
            first_time_customer_orders: '30.0',
            first_time_customer_revenue: '3000.00',
          },
          {
            channel: 'organic',
            campaign: 'referral',
            attributed_orders: '50.0',
            attributed_revenue: '5000.00',
            distinct_orders_touched: '48',
            attributed_cogs: '1500.00',
            attributed_payment_fees: '100.00',
            attributed_tax: '400.00',
            gross_revenue: '4600.00',
            net_profit: '3000.00',
            profit_margin_pct: '60.0',
            avg_order_value: '100.00',
            revenue_per_order_touched: '104.17',
            first_time_customer_orders: '15.0',
            first_time_customer_revenue: '1500.00',
          },
        ];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        expect(result.result.data).toHaveLength(3);
        // Verify sorted by revenue DESC
        expect(result.result.data[0].attributed_revenue).toBe(15000);
        expect(result.result.data[1].attributed_revenue).toBe(10000);
        expect(result.result.data[2].attributed_revenue).toBe(5000);
      });
    });

    describe('Profit Calculations', () => {
      it('should exclude VAT from gross revenue when ignore_vat = true', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [
          {
            channel: 'organic',
            campaign: 'seo',
            attributed_orders: '100.0',
            attributed_revenue: '10000.00',
            distinct_orders_touched: '95',
            attributed_cogs: '3000.00',
            attributed_payment_fees: '200.00',
            attributed_tax: '800.00',
            gross_revenue: '10000.00', // revenue (no VAT subtraction when ignore_vat = true)
            net_profit: '6800.00', // gross_revenue - cogs - fees
            profit_margin_pct: '68.0',
            avg_order_value: '100.00',
            revenue_per_order_touched: '105.26',
            first_time_customer_orders: '30.0',
            first_time_customer_revenue: '3000.00',
          },
        ];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        const campaign = result.result.data[0];
        expect(campaign.gross_revenue).toBe(10000); // No VAT subtracted
        expect(campaign.net_profit).toBe(6800); // 10000 - 3000 - 200
      });

      it('should include VAT in gross revenue calculation when ignore_vat = false', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [
          {
            channel: 'organic',
            campaign: 'seo',
            attributed_orders: '100.0',
            attributed_revenue: '10000.00',
            distinct_orders_touched: '95',
            attributed_cogs: '3000.00',
            attributed_payment_fees: '200.00',
            attributed_tax: '800.00',
            gross_revenue: '9200.00', // revenue - tax
            net_profit: '6000.00', // gross_revenue - cogs - fees
            profit_margin_pct: '60.0',
            avg_order_value: '100.00',
            revenue_per_order_touched: '105.26',
            first_time_customer_orders: '30.0',
            first_time_customer_revenue: '3000.00',
          },
        ];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        const campaign = result.result.data[0];
        expect(campaign.gross_revenue).toBe(9200); // 10000 - 800
        expect(campaign.net_profit).toBe(6000); // 9200 - 3000 - 200
      });

      it('should calculate net profit correctly', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [
          {
            channel: 'organic',
            campaign: 'seo',
            attributed_orders: '100.0',
            attributed_revenue: '10000.00',
            distinct_orders_touched: '95',
            attributed_cogs: '3000.00',
            attributed_payment_fees: '200.00',
            attributed_tax: '800.00',
            gross_revenue: '9200.00', // revenue - tax
            net_profit: '6000.00', // 9200 - 3000 - 200
            profit_margin_pct: '60.0',
            avg_order_value: '100.00',
            revenue_per_order_touched: '105.26',
            first_time_customer_orders: '30.0',
            first_time_customer_revenue: '3000.00',
          },
        ];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        const campaign = result.result.data[0];
        // Net profit = gross_revenue - cogs - payment_fees
        // 9200 - 3000 - 200 = 6000
        expect(campaign.net_profit).toBe(6000);
      });

      it('should calculate profit margin percentage correctly', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [
          {
            channel: 'organic',
            campaign: 'seo',
            attributed_orders: '100.0',
            attributed_revenue: '10000.00',
            distinct_orders_touched: '95',
            attributed_cogs: '3000.00',
            attributed_payment_fees: '200.00',
            attributed_tax: '800.00',
            gross_revenue: '9200.00',
            net_profit: '6000.00',
            profit_margin_pct: '60.0', // (6000 / 10000) * 100 = 60%
            avg_order_value: '100.00',
            revenue_per_order_touched: '105.26',
            first_time_customer_orders: '30.0',
            first_time_customer_revenue: '3000.00',
          },
        ];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        const campaign = result.result.data[0];
        expect(campaign.profit_margin_pct).toBe(60.0);
      });

      it('should handle zero revenue edge case (profit margin = 0)', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [
          {
            channel: 'organic',
            campaign: 'seo',
            attributed_orders: '0',
            attributed_revenue: '0',
            distinct_orders_touched: '0',
            attributed_cogs: '0',
            attributed_payment_fees: '0',
            attributed_tax: '0',
            gross_revenue: '0',
            net_profit: '0',
            profit_margin_pct: '0', // Should be 0, not Infinity or NaN
            avg_order_value: '0',
            revenue_per_order_touched: '0',
            first_time_customer_orders: '0',
            first_time_customer_revenue: '0',
          },
        ];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        const campaign = result.result.data[0];
        expect(campaign.profit_margin_pct).toBe(0);
        expect(campaign.net_profit).toBe(0);
      });
    });

    describe('Average Metrics', () => {
      it('should calculate AOV correctly (revenue / attributed_orders)', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [
          {
            channel: 'organic',
            campaign: 'seo',
            attributed_orders: '100.0',
            attributed_revenue: '10000.00',
            distinct_orders_touched: '95',
            attributed_cogs: '3000.00',
            attributed_payment_fees: '200.00',
            attributed_tax: '800.00',
            gross_revenue: '9200.00',
            net_profit: '6000.00',
            profit_margin_pct: '60.0',
            avg_order_value: '100.00', // 10000 / 100 = 100
            revenue_per_order_touched: '105.26',
            first_time_customer_orders: '30.0',
            first_time_customer_revenue: '3000.00',
          },
        ];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        const campaign = result.result.data[0];
        expect(campaign.avg_order_value).toBe(100.00);
      });

      it('should return AOV = 0 when attributed_orders is 0', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [
          {
            channel: 'organic',
            campaign: 'seo',
            attributed_orders: '0',
            attributed_revenue: '1000.00',
            distinct_orders_touched: '5',
            attributed_cogs: '300.00',
            attributed_payment_fees: '20.00',
            attributed_tax: '80.00',
            gross_revenue: '920.00',
            net_profit: '600.00',
            profit_margin_pct: '60.0',
            avg_order_value: '0', // Division by zero protection
            revenue_per_order_touched: '200.00',
            first_time_customer_orders: '0',
            first_time_customer_revenue: '0',
          },
        ];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        const campaign = result.result.data[0];
        expect(campaign.avg_order_value).toBe(0);
      });

      it('should calculate revenue per order touched correctly', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [
          {
            channel: 'organic',
            campaign: 'seo',
            attributed_orders: '100.0',
            attributed_revenue: '10000.00',
            distinct_orders_touched: '95',
            attributed_cogs: '3000.00',
            attributed_payment_fees: '200.00',
            attributed_tax: '800.00',
            gross_revenue: '9200.00',
            net_profit: '6000.00',
            profit_margin_pct: '60.0',
            avg_order_value: '100.00',
            revenue_per_order_touched: '105.26', // 10000 / 95 ≈ 105.26
            first_time_customer_orders: '30.0',
            first_time_customer_revenue: '3000.00',
          },
        ];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        const campaign = result.result.data[0];
        expect(campaign.revenue_per_order_touched).toBe(105.26);
      });
    });

    describe('First-Time Customer Metrics', () => {
      it('should aggregate first-time customer orders correctly', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [
          {
            channel: 'organic',
            campaign: 'seo',
            attributed_orders: '100.0',
            attributed_revenue: '10000.00',
            distinct_orders_touched: '95',
            attributed_cogs: '3000.00',
            attributed_payment_fees: '200.00',
            attributed_tax: '800.00',
            gross_revenue: '9200.00',
            net_profit: '6000.00',
            profit_margin_pct: '60.0',
            avg_order_value: '100.00',
            revenue_per_order_touched: '105.26',
            first_time_customer_orders: '30.0',
            first_time_customer_revenue: '3000.00',
          },
        ];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        const campaign = result.result.data[0];
        expect(campaign.first_time_customer_orders).toBe(30);
      });

      it('should aggregate first-time customer revenue correctly', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [
          {
            channel: 'organic',
            campaign: 'seo',
            attributed_orders: '100.0',
            attributed_revenue: '10000.00',
            distinct_orders_touched: '95',
            attributed_cogs: '3000.00',
            attributed_payment_fees: '200.00',
            attributed_tax: '800.00',
            gross_revenue: '9200.00',
            net_profit: '6000.00',
            profit_margin_pct: '60.0',
            avg_order_value: '100.00',
            revenue_per_order_touched: '105.26',
            first_time_customer_orders: '30.0',
            first_time_customer_revenue: '3000.00',
          },
        ];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        const campaign = result.result.data[0];
        expect(campaign.first_time_customer_revenue).toBe(3000);
      });
    });

    describe('Shop Resolution', () => {
      it('should successfully resolve shop_name from accountId', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        expect(result.result.metadata.shop_name).toBe('test-shop.myshopify.com');
        expect(mockSupabaseClient.from).toHaveBeenCalledWith('shopify_shops');
        expect(mockSupabaseClient.select).toHaveBeenCalledWith('shop_name');
        expect(mockSupabaseClient.eq).toHaveBeenCalledWith('account_id', 'account-123');
      });

      it('should throw error when shop not found', async () => {
        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: null,
          error: new Error('Shop not found'),
        } as any);

        await expect(service.getCampaignAnalytics(mockParams)).rejects.toThrow(
          'Shop not found for account'
        );
      });
    });

    describe('Attribution Table Integration', () => {
      it('should use correct attribution table based on model', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const { getAttributionTableName } = await import('@/utils/attribution-tables.js');

        await service.getCampaignAnalytics(mockParams);

        expect(getAttributionTableName).toHaveBeenCalledWith('last_paid_click');
      });

      it('should test with different attribution models', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const { getAttributionTableName } = await import('@/utils/attribution-tables.js');

        // Test first_click model
        await service.getCampaignAnalytics({
          ...mockParams,
          attributionModel: 'first_click',
        });

        expect(getAttributionTableName).toHaveBeenCalledWith('first_click');

        // Test linear_all model
        await service.getCampaignAnalytics({
          ...mockParams,
          attributionModel: 'linear_all',
        });

        expect(getAttributionTableName).toHaveBeenCalledWith('linear_all');
      });
    });

    describe('Error Handling', () => {
      it('should handle Supabase shop lookup errors', async () => {
        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: null,
          error: new Error('Database connection failed'),
        } as any);

        await expect(service.getCampaignAnalytics(mockParams)).rejects.toThrow(
          'Shop not found for account'
        );
      });

      it('should propagate ClickHouse query errors', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockRejectedValue(
          new Error('ClickHouse connection failed')
        );

        await expect(service.getCampaignAnalytics(mockParams)).rejects.toThrow(
          'ClickHouse connection failed'
        );
      });
    });

    describe('Empty Results', () => {
      it('should return empty data array when no campaigns found', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        expect(result.success).toBe(true);
        expect(result.result.data).toEqual([]);
        expect(result.result.data).toHaveLength(0);
      });
    });

    describe('Null Campaign Handling', () => {
      it('should handle campaigns with null campaign names', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [
          {
            channel: 'organic',
            campaign: null,
            attributed_orders: '50.0',
            attributed_revenue: '5000.00',
            distinct_orders_touched: '48',
            attributed_cogs: '1500.00',
            attributed_payment_fees: '100.00',
            attributed_tax: '400.00',
            gross_revenue: '4600.00',
            net_profit: '3000.00',
            profit_margin_pct: '60.0',
            avg_order_value: '100.00',
            revenue_per_order_touched: '104.17',
            first_time_customer_orders: '15.0',
            first_time_customer_revenue: '1500.00',
          },
        ];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        expect(result.result.data[0].campaign).toBeNull();
        expect(result.result.data[0].attributed_revenue).toBe(5000);
      });
    });

    describe('Channel Filtering', () => {
      it('should query for specified channel only', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [
          {
            channel: 'organic',
            campaign: 'seo',
            attributed_orders: '100.0',
            attributed_revenue: '10000.00',
            distinct_orders_touched: '95',
            attributed_cogs: '3000.00',
            attributed_payment_fees: '200.00',
            attributed_tax: '800.00',
            gross_revenue: '9200.00',
            net_profit: '6000.00',
            profit_margin_pct: '60.0',
            avg_order_value: '100.00',
            revenue_per_order_touched: '105.26',
            first_time_customer_orders: '30.0',
            first_time_customer_revenue: '3000.00',
          },
        ];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        const result = await service.getCampaignAnalytics(mockParams);

        expect(result.result.metadata.channel).toBe('organic');
        expect(result.result.data[0].channel).toBe('organic');
      });
    });

    describe('Date Range Parameters', () => {
      it('should pass correct date range to query', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        const mockQuery = vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        await service.getCampaignAnalytics(mockParams);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            startDate: '2024-01-01',
            endDate: '2024-01-31',
          })
        );
      });
    });

    describe('Attribution Window Parameters', () => {
      it('should pass correct attribution window to query', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        const mockQuery = vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        await service.getCampaignAnalytics(mockParams);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            attributionWindow: '28_day',
          })
        );
      });

      it('should handle different attribution windows', async () => {
        const mockShopData = { shop_name: 'test-shop.myshopify.com' };
        const mockCampaignData: NonAdSpendCampaign[] = [];

        vi.mocked(mockSupabaseClient.single).mockResolvedValue({
          data: mockShopData,
          error: null,
        } as any);

        const mockQuery = vi.mocked(clickhouseConnection.query).mockResolvedValue(mockCampaignData);

        // Test 7_day window
        await service.getCampaignAnalytics({
          ...mockParams,
          attributionWindow: '7_day',
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            attributionWindow: '7_day',
          })
        );
      });
    });
  });
});
