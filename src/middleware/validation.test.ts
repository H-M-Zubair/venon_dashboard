/**
 * Unit tests for validation middleware
 *
 * Testing strategy:
 * - Test successful validation with valid data
 * - Test validation failures with invalid data
 * - Test that validatedData is attached to request
 * - Test error handling when schema parsing throws
 * - Test validation for body, query, and params
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validateRequest } from './validation.js';

describe('validateRequest middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: any;
  let statusMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      body: {},
      query: {},
      params: {},
      url: '/test-endpoint',
    };

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };

    mockNext = vi.fn();
  });

  describe('Successful Validation', () => {
    it('should call next() when validation passes', () => {
      const schema = z.object({
        body: z.object({
          name: z.string(),
        }),
      });

      mockReq.body = { name: 'Test' };

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should attach validatedData to request', () => {
      const schema = z.object({
        body: z.object({
          name: z.string(),
          age: z.number(),
        }),
      });

      mockReq.body = { name: 'Test', age: 25 };

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect((mockReq as any).validatedData).toBeDefined();
      expect((mockReq as any).validatedData.body).toEqual({ name: 'Test', age: 25 });
    });

    it('should validate query parameters', () => {
      const schema = z.object({
        query: z.object({
          page: z.string(),
        }),
      });

      mockReq.query = { page: '1' };

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).validatedData.query).toEqual({ page: '1' });
    });

    it('should validate route params', () => {
      const schema = z.object({
        params: z.object({
          id: z.string(),
        }),
      });

      mockReq.params = { id: '123' };

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).validatedData.params).toEqual({ id: '123' });
    });

    it('should validate all request parts together', () => {
      const schema = z.object({
        body: z.object({ name: z.string() }),
        query: z.object({ page: z.string() }),
        params: z.object({ id: z.string() }),
      });

      mockReq.body = { name: 'Test' };
      mockReq.query = { page: '1' };
      mockReq.params = { id: '123' };

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).validatedData).toEqual({
        body: { name: 'Test' },
        query: { page: '1' },
        params: { id: '123' },
      });
    });
  });

  describe('Validation Failures', () => {
    it('should return 400 when validation fails', () => {
      const schema = z.object({
        body: z.object({
          name: z.string(),
        }),
      });

      mockReq.body = { name: 123 }; // Wrong type

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return validation error details', () => {
      const schema = z.object({
        body: z.object({
          name: z.string(),
          age: z.number(),
        }),
      });

      mockReq.body = { name: 123, age: 'invalid' };

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            field: expect.any(String),
            message: expect.any(String),
          }),
        ]),
      });
    });

    it('should include field paths in error details', () => {
      const schema = z.object({
        body: z.object({
          user: z.object({
            name: z.string(),
          }),
        }),
      });

      mockReq.body = { user: { name: 123 } };

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      const errorDetails = jsonMock.mock.calls[0][0].details;
      expect(errorDetails[0].field).toBe('body.user.name');
    });

    it('should handle missing required fields', () => {
      const schema = z.object({
        body: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
      });

      mockReq.body = {}; // Missing required fields

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock.mock.calls[0][0]).toHaveProperty('error', 'Validation failed');
      expect(jsonMock.mock.calls[0][0].details.length).toBeGreaterThan(0);
    });

    it('should handle multiple validation errors', () => {
      const schema = z.object({
        body: z.object({
          name: z.string().min(3),
          email: z.string().email(),
          age: z.number().min(18),
        }),
      });

      mockReq.body = {
        name: 'ab', // Too short
        email: 'invalid-email', // Invalid email
        age: 10, // Too young
      };

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      const errorDetails = jsonMock.mock.calls[0][0].details;
      expect(errorDetails.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should return 500 when schema parsing throws error', () => {
      // Create a schema that will throw during parsing
      const badSchema = {
        safeParse: () => {
          throw new Error('Schema error');
        },
      } as any;

      const middleware = validateRequest(badSchema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle unexpected errors gracefully', () => {
      const errorSchema = {
        safeParse: () => {
          throw new TypeError('Unexpected type error');
        },
      } as any;

      const middleware = validateRequest(errorSchema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty objects', () => {
      const schema = z.object({
        body: z.object({}),
        query: z.object({}),
        params: z.object({}),
      });

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle optional fields', () => {
      const schema = z.object({
        body: z.object({
          name: z.string(),
          age: z.number().optional(),
        }),
      });

      mockReq.body = { name: 'Test' };

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle default values', () => {
      const schema = z.object({
        body: z.object({
          name: z.string(),
          active: z.boolean().default(true),
        }),
      });

      mockReq.body = { name: 'Test' };

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as any).validatedData.body.active).toBe(true);
    });

    it('should not call next() after validation failure', () => {
      const schema = z.object({
        body: z.object({
          name: z.string(),
        }),
      });

      mockReq.body = {};

      const middleware = validateRequest(schema);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
