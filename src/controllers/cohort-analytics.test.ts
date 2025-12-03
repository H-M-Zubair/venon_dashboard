/**
 * Unit tests for CohortAnalyticsController
 *
 * Testing strategy:
 * - Mock CohortAnalyticsService
 * - Mock Express req/res objects
 * - Test validation, success scenarios, and error handling
 * - Note: This controller uses manual try-catch (not asyncHandler)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

// Mock dependencies before importing the controller
vi.mock('@/services/cohort-analytics.js', () => ({
  CohortAnalyticsService: vi.fn(),
}));

vi.mock('@/config/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks
import { CohortAnalyticsController } from './cohort-analytics.js';
import { CohortAnalyticsService } from '@/services/cohort-analytics.js';
import { AppError } from '@/middleware/error.js';

describe('CohortAnalyticsController', () => {
  let controller: CohortAnalyticsController;
  let mockService: any;
  let mockReq: Partial<Request & { user?: { id: string } }>;
  let mockRes: Partial<Response>;

  const mockCohortResult = {
    data: {
      cohorts: [
        {
          cohort: '2024-01-01',
          cohort_size: 100,
          cohort_ad_spend: 5000,
          cac_per_customer: 50,
          periods: [
            {
              period: 0,
              metrics: {
                incremental: {
                  active_customers: 100,
                  active_customers_percentage: 100,
                  orders: 120,
                  net_revenue: 6000,
                  contribution_margin_one: 4000,
                  contribution_margin_three: 3000,
                  average_order_value: 50,
                },
                cumulative: {
                  active_customers: 100,
                  active_customers_percentage: 100,
                  orders: 120,
                  net_revenue: 6000,
                  contribution_margin_one: 4000,
                  contribution_margin_three: 3000,
                  average_order_value: 50,
                  ltv_to_date: 60,
                  net_ltv_to_date: 40,
                  ltv_to_cac_ratio: 1.2,
                  net_ltv_to_cac_ratio: 0.8,
                  is_payback_achieved: false,
                  cumulative_contribution_margin_three_per_customer: 30,
                },
              },
            },
          ],
        },
      ],
    },
    metadata: {
      shop_name: 'test-shop.myshopify.com',
      cohort_type: 'month',
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      max_periods: 12,
      query_timestamp: '2024-01-15T00:00:00Z',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock service methods
    mockService = {
      getCohortAnalysis: vi.fn(),
    };

    // Mock the service constructor
    vi.mocked(CohortAnalyticsService).mockImplementation(() => mockService);

    // Create controller
    controller = new CohortAnalyticsController();

    // Mock request object
    mockReq = {
      user: {
        id: 'user-123',
      },
      query: {},
    };

    // Mock response object
    mockRes = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    };
  });

  describe('getCohortAnalysis', () => {
    const validQuery = {
      shop_name: 'test-shop.myshopify.com',
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      cohort_type: 'month',
    };

    describe('Request Validation', () => {
      it('should throw 400 error when shop_name is missing', async () => {
        mockReq.query = {
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          cohort_type: 'month',
        };

        await controller.getCohortAnalysis(
          mockReq as Request & { user?: { id: string } },
          mockRes as Response
        );

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid query parameters',
        });
      });

      it('should throw 400 error when start_date is missing', async () => {
        mockReq.query = {
          shop_name: 'test-shop.myshopify.com',
          end_date: '2024-01-31',
          cohort_type: 'month',
        };

        await controller.getCohortAnalysis(
          mockReq as Request & { user?: { id: string } },
          mockRes as Response
        );

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid query parameters',
        });
      });

      it('should throw 400 error when start_date has invalid format', async () => {
        mockReq.query = {
          shop_name: 'test-shop.myshopify.com',
          start_date: '01-01-2024', // Invalid format
          end_date: '2024-01-31',
          cohort_type: 'month',
        };

        await controller.getCohortAnalysis(
          mockReq as Request & { user?: { id: string } },
          mockRes as Response
        );

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid query parameters',
        });
      });

      it('should throw 400 error when end_date has invalid format', async () => {
        mockReq.query = {
          shop_name: 'test-shop.myshopify.com',
          start_date: '2024-01-01',
          end_date: '2024/01/31', // Invalid format
          cohort_type: 'month',
        };

        await controller.getCohortAnalysis(
          mockReq as Request & { user?: { id: string } },
          mockRes as Response
        );

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid query parameters',
        });
      });

      it('should throw 400 error when cohort_type is missing', async () => {
        mockReq.query = {
          shop_name: 'test-shop.myshopify.com',
          start_date: '2024-01-01',
          end_date: '2024-01-31',
        };

        await controller.getCohortAnalysis(
          mockReq as Request & { user?: { id: string } },
          mockRes as Response
        );

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid query parameters',
        });
      });

      it('should throw 400 error when cohort_type is invalid', async () => {
        mockReq.query = {
          shop_name: 'test-shop.myshopify.com',
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          cohort_type: 'invalid_type',
        };

        await controller.getCohortAnalysis(
          mockReq as Request & { user?: { id: string } },
          mockRes as Response
        );

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid query parameters',
        });
      });

      it('should accept all valid cohort_types', async () => {
        const validTypes = ['week', 'month', 'quarter', 'year'];
        mockService.getCohortAnalysis.mockResolvedValue(mockCohortResult);

        for (const cohort_type of validTypes) {
          mockReq.query = {
            shop_name: 'test-shop.myshopify.com',
            start_date: '2024-01-01',
            cohort_type,
          };

          await controller.getCohortAnalysis(
            mockReq as Request & { user?: { id: string } },
            mockRes as Response
          );

          expect(mockService.getCohortAnalysis).toHaveBeenCalledWith(
            expect.objectContaining({
              cohort_type,
            })
          );
        }
      });

      it('should accept request without end_date (optional)', async () => {
        mockReq.query = {
          shop_name: 'test-shop.myshopify.com',
          start_date: '2024-01-01',
          cohort_type: 'month',
        };
        mockService.getCohortAnalysis.mockResolvedValue(mockCohortResult);

        await controller.getCohortAnalysis(
          mockReq as Request & { user?: { id: string } },
          mockRes as Response
        );

        expect(mockService.getCohortAnalysis).toHaveBeenCalledWith(
          expect.objectContaining({
            shop_name: 'test-shop.myshopify.com',
            start_date: '2024-01-01',
            cohort_type: 'month',
          })
        );
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          result: mockCohortResult,
        });
      });

      it('should accept optional parameters (filter_product_id, filter_variant_id)', async () => {
        mockReq.query = {
          shop_name: 'test-shop.myshopify.com',
          start_date: '2024-01-01',
          cohort_type: 'month',
          filter_product_id: '123',
          filter_variant_id: '456',
        };
        mockService.getCohortAnalysis.mockResolvedValue(mockCohortResult);

        await controller.getCohortAnalysis(
          mockReq as Request & { user?: { id: string } },
          mockRes as Response
        );

        expect(mockService.getCohortAnalysis).toHaveBeenCalledWith(
          expect.objectContaining({
            shop_name: 'test-shop.myshopify.com',
            start_date: '2024-01-01',
            cohort_type: 'month',
            filter_product_id: 123,
            filter_variant_id: 456,
          })
        );
      });
    });

    describe('Success Scenarios', () => {
      it('should return cohort analysis data successfully', async () => {
        mockReq.query = validQuery;
        mockService.getCohortAnalysis.mockResolvedValue(mockCohortResult);

        await controller.getCohortAnalysis(
          mockReq as Request & { user?: { id: string } },
          mockRes as Response
        );

        expect(mockService.getCohortAnalysis).toHaveBeenCalledWith({
          shop_name: 'test-shop.myshopify.com',
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          cohort_type: 'month',
        });

        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          result: mockCohortResult,
        });
      });

      it('should work without authenticated user', async () => {
        mockReq.user = undefined;
        mockReq.query = validQuery;
        mockService.getCohortAnalysis.mockResolvedValue(mockCohortResult);

        await controller.getCohortAnalysis(
          mockReq as Request & { user?: { id: string } },
          mockRes as Response
        );

        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          result: mockCohortResult,
        });
      });
    });

    describe('Error Handling', () => {
      it('should handle AppError correctly', async () => {
        mockReq.query = validQuery;
        const appError = new AppError('Service unavailable', 503);
        mockService.getCohortAnalysis.mockRejectedValue(appError);

        await controller.getCohortAnalysis(
          mockReq as Request & { user?: { id: string } },
          mockRes as Response
        );

        expect(mockRes.status).toHaveBeenCalledWith(503);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Service unavailable',
        });
      });

      it('should handle generic errors with 500 status', async () => {
        mockReq.query = validQuery;
        mockService.getCohortAnalysis.mockRejectedValue(new Error('Database connection failed'));

        await controller.getCohortAnalysis(
          mockReq as Request & { user?: { id: string } },
          mockRes as Response
        );

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Internal server error while fetching cohort analysis',
        });
      });

      it('should handle non-Error objects', async () => {
        mockReq.query = validQuery;
        mockService.getCohortAnalysis.mockRejectedValue('Something went wrong');

        await controller.getCohortAnalysis(
          mockReq as Request & { user?: { id: string } },
          mockRes as Response
        );

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          error: 'Internal server error while fetching cohort analysis',
        });
      });
    });
  });
});
