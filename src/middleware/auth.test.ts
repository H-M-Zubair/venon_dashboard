/**
 * Unit tests for Auth Middleware
 *
 * Testing strategy:
 * - Test successful JWT authentication flow
 * - Test missing/invalid authorization header
 * - Test invalid/expired tokens
 * - Test error handling
 * - Test that req.user is properly set (id and email only)
 * - Verify NO database queries are made (JWT-only authentication)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response, NextFunction } from 'express';
import { authenticateUser, AuthenticatedRequest } from './auth.js';

// Mock the Supabase connection (only need getClient for JWT validation)
vi.mock('@/database/supabase/connection.js', () => ({
  supabaseConnection: {
    getClient: vi.fn(),
  },
}));

// Import the mocked connection
import { supabaseConnection } from '@/database/supabase/connection.js';

describe('Auth Middleware', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: any;
  let statusMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      headers: {},
    };

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };

    mockNext = vi.fn();
  });

  describe('Authorization Header Validation', () => {
    it('should return 401 when authorization header is missing', async () => {
      mockReq.headers = {};

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Missing or invalid authorization header',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header does not start with Bearer', async () => {
      mockReq.headers = { authorization: 'InvalidToken' };

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Missing or invalid authorization header',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header is just "Bearer" without token', async () => {
      mockReq.headers = { authorization: 'Bearer' };

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Missing or invalid authorization header',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Token Validation', () => {
    it('should return 401 when token is invalid', async () => {
      mockReq.headers = { authorization: 'Bearer invalid-token' };

      const mockAuthClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid token' },
          }),
        },
      };

      vi.mocked(supabaseConnection.getClient).mockReturnValue(mockAuthClient as any);

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Invalid or expired token',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when token is expired', async () => {
      mockReq.headers = { authorization: 'Bearer expired-token' };

      const mockAuthClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Token expired' },
          }),
        },
      };

      vi.mocked(supabaseConnection.getClient).mockReturnValue(mockAuthClient as any);

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Invalid or expired token',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when getUser returns no user', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };

      const mockAuthClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: null,
          }),
        },
      };

      vi.mocked(supabaseConnection.getClient).mockReturnValue(mockAuthClient as any);

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Invalid or expired token',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Successful Authentication', () => {
    it('should successfully authenticate with valid JWT', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };

      const mockAuthClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: mockUser },
            error: null,
          }),
        },
      };

      vi.mocked(supabaseConnection.getClient).mockReturnValue(mockAuthClient as any);

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      // Should only set id and email (NO account_id)
      expect(mockReq.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
      });
      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should not make any database queries (JWT-only authentication)', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };

      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };

      const mockAuthClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: mockUser },
            error: null,
          }),
        },
      };

      vi.mocked(supabaseConnection.getClient).mockReturnValue(mockAuthClient as any);

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      // Verify only JWT validation was called, no DB queries
      expect(mockAuthClient.auth.getUser).toHaveBeenCalledWith('valid-token');
      expect(supabaseConnection.getClient).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should return 500 when unexpected error occurs', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };

      const mockAuthClient = {
        auth: {
          getUser: vi.fn().mockRejectedValue(new Error('Unexpected error')),
        },
      };

      vi.mocked(supabaseConnection.getClient).mockReturnValue(mockAuthClient as any);

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

  });

  describe('Integration Tests', () => {
    it('should properly extract token from Bearer header', async () => {
      mockReq.headers = { authorization: 'Bearer my-special-token-123' };

      const mockAuthClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: 'user-123',
                email: 'test@example.com',
              },
            },
            error: null,
          }),
        },
      };

      vi.mocked(supabaseConnection.getClient).mockReturnValue(mockAuthClient as any);

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      // Verify getUser was called with the correct token (after "Bearer ")
      expect(mockAuthClient.auth.getUser).toHaveBeenCalledWith('my-special-token-123');
      expect(mockReq.user).toEqual({
        id: 'user-123',
        email: 'test@example.com',
      });
    });

    it('should not set req.user when authentication fails', async () => {
      mockReq.headers = { authorization: 'Bearer invalid-token' };

      const mockAuthClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid token' },
          }),
        },
      };

      vi.mocked(supabaseConnection.getClient).mockReturnValue(mockAuthClient as any);

      await authenticateUser(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
