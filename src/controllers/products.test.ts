/**
 * Unit tests for ProductsController
 *
 * Testing strategy:
 * - Mock ProductsService
 * - Test successful product fetching
 * - Test validation errors (invalid query params)
 * - Test error handling (service errors, AppError, unknown errors)
 * - Verify response format and status codes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

// Mock ProductsService
vi.mock('@/services/products.js', () => ({
  ProductsService: vi.fn().mockImplementation(() => ({
    getProducts: vi.fn(),
  })),
}));

// Import after mocks
import { ProductsController } from './products.js';
import { ProductsService } from '@/services/products.js';
import { AppError } from '@/middleware/error.js';

describe('ProductsController', () => {
  let controller: ProductsController;
  let mockService: any;
  let mockReq: Partial<Request & { user?: { id: string } }>;
  let mockRes: Partial<Response>;
  let jsonMock: any;
  let statusMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Get the mocked service instance
    controller = new ProductsController();
    mockService = (controller as any).productsService;

    // Setup request mock
    mockReq = {
      query: {},
      user: { id: 'user-123' },
    };

    // Setup response mock
    jsonMock = vi.fn().mockReturnThis();
    statusMock = vi.fn().mockReturnThis();
    mockRes = {
      json: jsonMock,
      status: statusMock,
    };
  });

  describe('getProducts', () => {
    describe('Success Scenarios', () => {
      it('should return products successfully', async () => {
        const mockProducts = {
          products: [
            { id: 1, title: 'Product 1', variants: [] },
            { id: 2, title: 'Product 2', variants: [] },
          ],
        };

        mockReq.query = { shop_name: 'test-shop.myshopify.com' };
        mockService.getProducts.mockResolvedValue(mockProducts);

        await controller.getProducts(mockReq as Request, mockRes as Response);

        expect(mockService.getProducts).toHaveBeenCalledWith({
          shop_name: 'test-shop.myshopify.com',
        });
        expect(jsonMock).toHaveBeenCalledWith({
          success: true,
          result: mockProducts,
        });
      });

      it('should pass shop_name to service', async () => {
        mockReq.query = { shop_name: 'my-shop.myshopify.com' };
        mockService.getProducts.mockResolvedValue({ products: [] });

        await controller.getProducts(mockReq as Request, mockRes as Response);

        expect(mockService.getProducts).toHaveBeenCalledWith({
          shop_name: 'my-shop.myshopify.com',
        });
      });

      it('should handle requests without user', async () => {
        mockReq.user = undefined;
        mockReq.query = { shop_name: 'test-shop.myshopify.com' };
        mockService.getProducts.mockResolvedValue({ products: [] });

        await controller.getProducts(mockReq as Request, mockRes as Response);

        expect(jsonMock).toHaveBeenCalledWith({
          success: true,
          result: { products: [] },
        });
      });

      it('should return empty products array when no products found', async () => {
        mockReq.query = { shop_name: 'test-shop.myshopify.com' };
        mockService.getProducts.mockResolvedValue({ products: [] });

        await controller.getProducts(mockReq as Request, mockRes as Response);

        expect(jsonMock).toHaveBeenCalledWith({
          success: true,
          result: { products: [] },
        });
      });
    });

    describe('Validation Errors', () => {
      it('should return 400 when shop_name is missing', async () => {
        mockReq.query = {};

        await controller.getProducts(mockReq as Request, mockRes as Response);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid query parameters',
        });
      });

      it('should return 400 when shop_name is invalid', async () => {
        mockReq.query = { shop_name: '' };

        await controller.getProducts(mockReq as Request, mockRes as Response);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid query parameters',
        });
      });

      it('should return 400 when shop_name is not a string', async () => {
        mockReq.query = { shop_name: 123 as any };

        await controller.getProducts(mockReq as Request, mockRes as Response);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid query parameters',
        });
      });
    });

    describe('Service Errors', () => {
      it('should handle AppError from service', async () => {
        mockReq.query = { shop_name: 'test-shop.myshopify.com' };
        const appError = new AppError('Products not found', 404);
        mockService.getProducts.mockRejectedValue(appError);

        await controller.getProducts(mockReq as Request, mockRes as Response);

        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith({
          success: false,
          error: 'Products not found',
        });
      });

      it('should handle generic Error from service', async () => {
        mockReq.query = { shop_name: 'test-shop.myshopify.com' };
        mockService.getProducts.mockRejectedValue(new Error('Database connection failed'));

        await controller.getProducts(mockReq as Request, mockRes as Response);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({
          success: false,
          error: 'Internal server error while fetching products',
        });
      });

      it('should handle non-Error exceptions', async () => {
        mockReq.query = { shop_name: 'test-shop.myshopify.com' };
        mockService.getProducts.mockRejectedValue('String error');

        await controller.getProducts(mockReq as Request, mockRes as Response);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({
          success: false,
          error: 'Internal server error while fetching products',
        });
      });

      it('should handle AppError with custom status code', async () => {
        mockReq.query = { shop_name: 'test-shop.myshopify.com' };
        const appError = new AppError('Unauthorized', 401);
        mockService.getProducts.mockRejectedValue(appError);

        await controller.getProducts(mockReq as Request, mockRes as Response);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({
          success: false,
          error: 'Unauthorized',
        });
      });
    });

    describe('Response Format', () => {
      it('should always include success field in response', async () => {
        mockReq.query = { shop_name: 'test-shop.myshopify.com' };
        mockService.getProducts.mockResolvedValue({ products: [] });

        await controller.getProducts(mockReq as Request, mockRes as Response);

        const response = jsonMock.mock.calls[0][0];
        expect(response).toHaveProperty('success');
      });

      it('should include result field on success', async () => {
        mockReq.query = { shop_name: 'test-shop.myshopify.com' };
        mockService.getProducts.mockResolvedValue({ products: [] });

        await controller.getProducts(mockReq as Request, mockRes as Response);

        const response = jsonMock.mock.calls[0][0];
        expect(response).toHaveProperty('result');
        expect(response.success).toBe(true);
      });

      it('should include error field on failure', async () => {
        mockReq.query = {};

        await controller.getProducts(mockReq as Request, mockRes as Response);

        const response = jsonMock.mock.calls[0][0];
        expect(response).toHaveProperty('error');
        expect(response.success).toBe(false);
      });
    });
  });
});
