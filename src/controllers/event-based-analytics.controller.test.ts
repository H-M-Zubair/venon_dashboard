/**
 * Unit tests for EventBasedAnalyticsController
 *
 * Testing strategy:
 * - Mock EventBasedAnalyticsService methods
 * - Mock Express req/res/next objects
 * - Mock authentication (req.user)
 * - Mock validation helpers
 * - Test both controller methods: getEventBasedChannelPerformance, getEventBasedPixelChannelPerformance
 * - Test authentication, validation, authorization, success scenarios, and error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';

// Mock dependencies before importing the controller
vi.mock('@/services/event-based-analytics.js', () => ({
  EventBasedAnalyticsService: vi.fn(),
}));

vi.mock('@/utils/account-helpers.js', () => ({
  validateUserAccountAccess: vi.fn(),
}));

// Import after mocks
import { EventBasedAnalyticsController } from './event-based-analytics.js';
import { EventBasedAnalyticsService } from '@/services/event-based-analytics.js';
import { validateUserAccountAccess } from '@/utils/account-helpers.js';
import { AuthenticatedRequestWithRole } from '@/middleware/rbac.js';
import { AppError } from '@/middleware/error.js';

describe('EventBasedAnalyticsController', () => {
  let controller: EventBasedAnalyticsController;
  let mockService: any;
  let mockReq: Partial<AuthenticatedRequestWithRole>;
  let mockRes: Partial<Response>;
  let mockNext: any;

  const mockChannelPerformanceResult = {
    data: [
      {
        channel: 'meta-ads',
        attributed_orders: 100,
        attributed_revenue: 5000,
        ad_spend: 1000,
        roas: 5.0,
        net_profit: 2500,
      },
      {
        channel: 'google-ads',
        attributed_orders: 80,
        attributed_revenue: 4000,
        ad_spend: 800,
        roas: 5.0,
        net_profit: 2000,
      },
    ],
    metadata: {
      shop_name: 'test-shop.myshopify.com',
      date_range: {
        start: '2024-01-01',
        end: '2024-01-31',
      },
      attribution_model: 'last_paid_click',
      total_channels: 2,
    },
  };

  const mockPixelChannelPerformanceResult = {
    data: [
      {
        campaign_name: 'Summer Sale',
        campaign_pk: 'camp-123',
        attributed_orders: 50,
        attributed_revenue: 2500,
        ad_spend: 500,
      },
    ],
    metadata: {
      shop_name: 'test-shop.myshopify.com',
      channel: 'meta-ads',
      date_range: {
        start: '2024-01-01',
        end: '2024-01-31',
      },
      attribution_model: 'last_paid_click',
      total_campaigns: 1,
      total_ad_sets: 3,
      total_ads: 10,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock service methods
    mockService = {
      getEventBasedChannelPerformance: vi.fn(),
      getEventBasedPixelChannelPerformance: vi.fn(),
    };

    // Mock the service constructor
    vi.mocked(EventBasedAnalyticsService).mockImplementation(() => mockService);

    // Create controller
    controller = new EventBasedAnalyticsController();

    // Directly inject the mock service to bypass constructor issues
    (controller as any).service = mockService;

    // Mock request object
    mockReq = {
      user: {
        id: 'user-123',
        account_id: 'account-123',
        role: 'admin',
        shop_name: 'test-shop.myshopify.com',
      },
      query: {},
    };

    // Mock response object
    mockRes = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    // Mock next function
    mockNext = vi.fn();

    // Mock validation helper
    vi.mocked(validateUserAccountAccess).mockResolvedValue(undefined);
  });

  describe('getEventBasedChannelPerformance', () => {
    const validQuery = {
      account_id: 'account-123',
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      attribution_model: 'last_paid_click',
    };

    describe('Authentication', () => {
      it('should throw 401 error when user is not authenticated', async () => {
        mockReq.user = undefined;

        await controller.getEventBasedChannelPerformance(
          mockReq as AuthenticatedRequestWithRole,
          mockRes as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalled();
        const error = mockNext.mock.calls[0][0];
        expect(error).toBeInstanceOf(AppError);
        expect(error.message).toBe('Authentication required');
        expect(error.statusCode).toBe(401);
      });
    });

    describe('Request Validation', () => {
      it('should throw 400 error when account_id is missing', async () => {
        mockReq.query = {
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          attribution_model: 'last_paid_click',
        };

        await controller.getEventBasedChannelPerformance(
          mockReq as AuthenticatedRequestWithRole,
          mockRes as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalled();
        const error = mockNext.mock.calls[0][0];
        expect(error).toBeInstanceOf(AppError);
        expect(error.statusCode).toBe(400);
      });

      it('should throw 400 error when start_date is invalid format', async () => {
        mockReq.query = {
          account_id: 'account-123',
          start_date: '01-01-2024', // Invalid format
          end_date: '2024-01-31',
          attribution_model: 'last_paid_click',
        };

        await controller.getEventBasedChannelPerformance(
          mockReq as AuthenticatedRequestWithRole,
          mockRes as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalled();
        const error = mockNext.mock.calls[0][0];
        expect(error).toBeInstanceOf(AppError);
        expect(error.statusCode).toBe(400);
      });

      it('should throw 400 error when end_date is invalid format', async () => {
        mockReq.query = {
          account_id: 'account-123',
          start_date: '2024-01-01',
          end_date: '2024/01/31', // Invalid format
          attribution_model: 'last_paid_click',
        };

        await controller.getEventBasedChannelPerformance(
          mockReq as AuthenticatedRequestWithRole,
          mockRes as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalled();
        const error = mockNext.mock.calls[0][0];
        expect(error).toBeInstanceOf(AppError);
        expect(error.statusCode).toBe(400);
      });

      it('should throw 400 error when attribution_model is invalid', async () => {
        mockReq.query = {
          account_id: 'account-123',
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          attribution_model: 'invalid_model',
        };

        await controller.getEventBasedChannelPerformance(
          mockReq as AuthenticatedRequestWithRole,
          mockRes as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalled();
        const error = mockNext.mock.calls[0][0];
        expect(error).toBeInstanceOf(AppError);
        expect(error.statusCode).toBe(400);
      });

      it('should use default attribution_model when not provided', async () => {
        mockReq.query = {
          account_id: 'account-123',
          start_date: '2024-01-01',
          end_date: '2024-01-31',
        };
        mockService.getEventBasedChannelPerformance.mockResolvedValue(
          mockChannelPerformanceResult
        );

        await controller.getEventBasedChannelPerformance(
          mockReq as AuthenticatedRequestWithRole,
          mockRes as Response,
          mockNext
        );

        expect(mockService.getEventBasedChannelPerformance).toHaveBeenCalledWith(
          'account-123',
          expect.objectContaining({
            attribution_model: 'last_paid_click', // Default value
          })
        );
      });

      it('should accept all valid attribution models', async () => {
        const models = ['first_click', 'last_click', 'last_paid_click', 'linear_all', 'linear_paid'];
        mockService.getEventBasedChannelPerformance.mockResolvedValue(
          mockChannelPerformanceResult
        );

        for (const model of models) {
          mockReq.query = {
            ...validQuery,
            attribution_model: model,
          };

          await controller.getEventBasedChannelPerformance(
            mockReq as AuthenticatedRequestWithRole,
            mockRes as Response,
            mockNext
          );

          expect(mockService.getEventBasedChannelPerformance).toHaveBeenCalledWith(
            'account-123',
            expect.objectContaining({
              attribution_model: model,
            })
          );
        }
      });
    });

    // Authorization is now handled by RBAC middleware at the route level

    describe('Success Scenarios', () => {
      it('should call service with correct parameters', async () => {
        mockReq.query = validQuery;
        mockService.getEventBasedChannelPerformance.mockResolvedValue(
          mockChannelPerformanceResult
        );

        await controller.getEventBasedChannelPerformance(
          mockReq as AuthenticatedRequestWithRole,
          mockRes as Response,
          mockNext
        );

        expect(mockService.getEventBasedChannelPerformance).toHaveBeenCalledWith(
          'account-123',
          {
            account_id: 'account-123',
            start_date: '2024-01-01',
            end_date: '2024-01-31',
            attribution_model: 'last_paid_click',
          }
        );
      });
    });
  });

  describe('getEventBasedPixelChannelPerformance', () => {
    const validQuery = {
      account_id: 'account-123',
      channel: 'meta-ads',
      start_date: '2024-01-01',
      end_date: '2024-01-31',
      attribution_model: 'last_paid_click',
    };

    describe('Authentication', () => {
      it('should throw 401 error when user is not authenticated', async () => {
        mockReq.user = undefined;

        await controller.getEventBasedPixelChannelPerformance(
          mockReq as AuthenticatedRequestWithRole,
          mockRes as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalled();
        const error = mockNext.mock.calls[0][0];
        expect(error).toBeInstanceOf(AppError);
        expect(error.message).toBe('Authentication required');
        expect(error.statusCode).toBe(401);
      });
    });

    describe('Request Validation', () => {
      it('should throw 400 error when channel is missing', async () => {
        mockReq.query = {
          account_id: 'account-123',
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          attribution_model: 'last_paid_click',
        };

        await controller.getEventBasedPixelChannelPerformance(
          mockReq as AuthenticatedRequestWithRole,
          mockRes as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalled();
        const error = mockNext.mock.calls[0][0];
        expect(error).toBeInstanceOf(AppError);
        expect(error.statusCode).toBe(400);
      });

      it('should throw 400 error when account_id is missing', async () => {
        mockReq.query = {
          channel: 'meta-ads',
          start_date: '2024-01-01',
          end_date: '2024-01-31',
          attribution_model: 'last_paid_click',
        };

        await controller.getEventBasedPixelChannelPerformance(
          mockReq as AuthenticatedRequestWithRole,
          mockRes as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalled();
        const error = mockNext.mock.calls[0][0];
        expect(error).toBeInstanceOf(AppError);
        expect(error.statusCode).toBe(400);
      });

      it('should throw 400 error when dates are invalid', async () => {
        mockReq.query = {
          account_id: 'account-123',
          channel: 'meta-ads',
          start_date: 'invalid-date',
          end_date: '2024-01-31',
          attribution_model: 'last_paid_click',
        };

        await controller.getEventBasedPixelChannelPerformance(
          mockReq as AuthenticatedRequestWithRole,
          mockRes as Response,
          mockNext
        );

        expect(mockNext).toHaveBeenCalled();
        const error = mockNext.mock.calls[0][0];
        expect(error).toBeInstanceOf(AppError);
        expect(error.statusCode).toBe(400);
      });

      it('should use default attribution_model when not provided', async () => {
        mockReq.query = {
          account_id: 'account-123',
          channel: 'meta-ads',
          start_date: '2024-01-01',
          end_date: '2024-01-31',
        };
        mockService.getEventBasedPixelChannelPerformance.mockResolvedValue(
          mockPixelChannelPerformanceResult
        );

        await controller.getEventBasedPixelChannelPerformance(
          mockReq as AuthenticatedRequestWithRole,
          mockRes as Response,
          mockNext
        );

        expect(mockService.getEventBasedPixelChannelPerformance).toHaveBeenCalledWith(
          'account-123',
          expect.objectContaining({
            attribution_model: 'last_paid_click', // Default value
          })
        );
      });
    });

    // Authorization is now handled by RBAC middleware at the route level

    describe('Success Scenarios', () => {
      it('should call service with correct parameters', async () => {
        mockReq.query = validQuery;
        mockService.getEventBasedPixelChannelPerformance.mockResolvedValue(
          mockPixelChannelPerformanceResult
        );

        await controller.getEventBasedPixelChannelPerformance(
          mockReq as AuthenticatedRequestWithRole,
          mockRes as Response,
          mockNext
        );

        expect(mockService.getEventBasedPixelChannelPerformance).toHaveBeenCalledWith(
          'account-123',
          {
            account_id: 'account-123',
            channel: 'meta-ads',
            start_date: '2024-01-01',
            end_date: '2024-01-31',
            attribution_model: 'last_paid_click',
          }
        );
      });
    });
  });
});
