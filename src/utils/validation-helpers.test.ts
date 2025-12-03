/**
 * Unit Tests for Validation Helpers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';
import { z } from 'zod';
import {
  formatValidationErrors,
  handleValidationError,
  sendSuccessResponse,
  sendErrorResponse,
} from './validation-helpers';

// Mock the logger
vi.mock('@/config/logger.js', () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import logger from '@/config/logger.js';

describe('validation-helpers', () => {
  // Mock Response object
  let mockResponse: Partial<Response>;
  let mockJson: ReturnType<typeof vi.fn>;
  let mockStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockJson = vi.fn();
    mockStatus = vi.fn().mockReturnThis();

    mockResponse = {
      status: mockStatus,
      json: mockJson,
    } as Partial<Response>;
  });

  describe('formatValidationErrors', () => {
    it('should format single error correctly', () => {
      const errors: z.ZodIssue[] = [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['name'],
          message: 'Expected string, received number',
        },
      ];

      const result = formatValidationErrors(errors);

      expect(result).toEqual([
        {
          field: 'name',
          message: 'Expected string, received number',
        },
      ]);
    });

    it('should format multiple errors correctly', () => {
      const errors: z.ZodIssue[] = [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['name'],
          message: 'Expected string, received number',
        },
        {
          code: 'too_small',
          minimum: 1,
          type: 'string',
          inclusive: true,
          exact: false,
          path: ['email'],
          message: 'String must contain at least 1 character(s)',
        },
      ];

      const result = formatValidationErrors(errors);

      expect(result).toEqual([
        {
          field: 'name',
          message: 'Expected string, received number',
        },
        {
          field: 'email',
          message: 'String must contain at least 1 character(s)',
        },
      ]);
    });

    it('should handle nested path correctly', () => {
      const errors: z.ZodIssue[] = [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['user', 'address', 'city'],
          message: 'Expected string, received number',
        },
      ];

      const result = formatValidationErrors(errors);

      expect(result).toEqual([
        {
          field: 'user.address.city',
          message: 'Expected string, received number',
        },
      ]);
    });

    it('should handle array indices in path', () => {
      const errors: z.ZodIssue[] = [
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['items', 0, 'name'],
          message: 'Expected string, received number',
        },
      ];

      const result = formatValidationErrors(errors);

      expect(result).toEqual([
        {
          field: 'items.0.name',
          message: 'Expected string, received number',
        },
      ]);
    });

    it('should handle empty path', () => {
      const errors: z.ZodIssue[] = [
        {
          code: 'custom',
          path: [],
          message: 'Invalid value',
        },
      ];

      const result = formatValidationErrors(errors);

      expect(result).toEqual([
        {
          field: '',
          message: 'Invalid value',
        },
      ]);
    });

    it('should handle empty errors array', () => {
      const errors: z.ZodIssue[] = [];

      const result = formatValidationErrors(errors);

      expect(result).toEqual([]);
    });
  });

  describe('handleValidationError', () => {
    it('should return false and not send response when validation succeeds', () => {
      const schema = z.object({ name: z.string() });
      const validation = schema.safeParse({ name: 'John' });

      const result = handleValidationError(validation, mockResponse as Response);

      expect(result).toBe(false);
      expect(mockStatus).not.toHaveBeenCalled();
      expect(mockJson).not.toHaveBeenCalled();
    });

    it('should return true and send 400 response when validation fails', () => {
      const schema = z.object({ name: z.string() });
      const validation = schema.safeParse({ name: 123 });

      const result = handleValidationError(validation, mockResponse as Response);

      expect(result).toBe(true);
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid request parameters',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: expect.any(String),
            message: expect.any(String),
          }),
        ]),
      });
    });

    it('should include formatted errors in response', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const validation = schema.safeParse({ name: 123, age: 'not a number' });

      handleValidationError(validation, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid request parameters',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'name',
          }),
          expect.objectContaining({
            field: 'age',
          }),
        ]),
      });
    });

    it('should log validation failure when context is provided', () => {
      const schema = z.object({ name: z.string() });
      const validation = schema.safeParse({ name: 123 });
      const context = { userId: 'user-123', endpoint: 'test-endpoint' };

      handleValidationError(validation, mockResponse as Response, context);

      expect(logger.warn).toHaveBeenCalledWith(
        'Validation failed',
        expect.objectContaining({
          userId: 'user-123',
          endpoint: 'test-endpoint',
          errors: expect.any(Array),
        })
      );
    });

    it('should not log when no context is provided', () => {
      const schema = z.object({ name: z.string() });
      const validation = schema.safeParse({ name: 123 });

      handleValidationError(validation, mockResponse as Response);

      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should handle complex nested validation errors', () => {
      const schema = z.object({
        user: z.object({
          profile: z.object({
            email: z.string().email(),
          }),
        }),
      });
      const validation = schema.safeParse({
        user: { profile: { email: 'invalid-email' } },
      });

      handleValidationError(validation, mockResponse as Response);

      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid request parameters',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: 'user.profile.email',
          }),
        ]),
      });
    });
  });

  describe('sendSuccessResponse', () => {
    it('should send success response without metadata', () => {
      const result = { data: [1, 2, 3] };

      sendSuccessResponse(mockResponse as Response, result);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        result: { data: [1, 2, 3] },
      });
    });

    it('should send success response with metadata', () => {
      const result = { data: [1, 2, 3] };
      const metadata = { total: 3, page: 1 };

      sendSuccessResponse(mockResponse as Response, result, metadata);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        result: { data: [1, 2, 3] },
        metadata: { total: 3, page: 1 },
      });
    });

    it('should handle null result', () => {
      sendSuccessResponse(mockResponse as Response, null);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        result: null,
      });
    });

    it('should handle undefined result', () => {
      sendSuccessResponse(mockResponse as Response, undefined);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        result: undefined,
      });
    });

    it('should handle empty metadata object', () => {
      const result = { data: [] };
      const metadata = {};

      sendSuccessResponse(mockResponse as Response, result, metadata);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        result: { data: [] },
        metadata: {},
      });
    });

    it('should handle complex result structures', () => {
      const result = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        total: 2,
      };

      sendSuccessResponse(mockResponse as Response, result);

      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        result,
      });
    });
  });

  describe('sendErrorResponse', () => {
    it('should send error response without details', () => {
      sendErrorResponse(mockResponse as Response, 404, 'Resource not found');

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Resource not found',
      });
    });

    it('should send error response with details', () => {
      const details = { resourceId: '123', resourceType: 'user' };

      sendErrorResponse(mockResponse as Response, 404, 'Resource not found', details);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Resource not found',
        details: { resourceId: '123', resourceType: 'user' },
      });
    });

    it('should handle 400 Bad Request', () => {
      sendErrorResponse(mockResponse as Response, 400, 'Invalid request');

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid request',
      });
    });

    it('should handle 401 Unauthorized', () => {
      sendErrorResponse(mockResponse as Response, 401, 'Unauthorized');

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized',
      });
    });

    it('should handle 403 Forbidden', () => {
      sendErrorResponse(mockResponse as Response, 403, 'Access denied');

      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Access denied',
      });
    });

    it('should handle 500 Internal Server Error', () => {
      sendErrorResponse(mockResponse as Response, 500, 'Internal server error');

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error',
      });
    });

    it('should handle array details', () => {
      const details = ['error1', 'error2', 'error3'];

      sendErrorResponse(mockResponse as Response, 400, 'Multiple errors', details);

      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Multiple errors',
        details: ['error1', 'error2', 'error3'],
      });
    });

    it('should handle object details with nested structure', () => {
      const details = {
        validation: {
          fields: ['name', 'email'],
          message: 'Invalid fields',
        },
      };

      sendErrorResponse(mockResponse as Response, 400, 'Validation failed', details);

      expect(mockJson).toHaveBeenCalledWith({
        success: false,
        error: 'Validation failed',
        details,
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete validation flow for valid data', () => {
      const schema = z.object({
        accountId: z.string(),
        startDate: z.string(),
        endDate: z.string(),
      });

      const validation = schema.safeParse({
        accountId: 'acc-123',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const hasError = handleValidationError(validation, mockResponse as Response);

      expect(hasError).toBe(false);
      expect(mockResponse.status).not.toHaveBeenCalled();

      // Proceed with success response
      sendSuccessResponse(mockResponse as Response, { data: 'processed' });
      expect(mockJson).toHaveBeenCalledWith({
        success: true,
        result: { data: 'processed' },
      });
    });

    it('should handle complete validation flow for invalid data', () => {
      const schema = z.object({
        accountId: z.string(),
        startDate: z.string(),
        endDate: z.string(),
      });

      const validation = schema.safeParse({
        accountId: 123, // Invalid type
        startDate: '2024-01-01',
        // endDate missing
      });

      const hasError = handleValidationError(validation, mockResponse as Response, {
        endpoint: 'test-api',
      });

      expect(hasError).toBe(true);
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
