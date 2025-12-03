/**
 * Unit tests for RBAC Middleware
 *
 * Testing strategy:
 * - Test authentication requirements (req.user must exist)
 * - Test shop name resolution from multiple sources (query, body, params)
 * - Test shop name resolution from account_id (query, body, params)
 * - Test role fetching from database
 * - Test role authorization logic
 * - Test request enhancement (attaching role and shop_name)
 * - Test shorthand middleware functions
 * - Test utility functions (hasRole, getUserShops)
 * - Test error handling for all failure scenarios
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response, NextFunction } from 'express';
import {
  requireRole,
  requireAdmin,
  requireEditor,
  requireAnyRole,
  hasRole,
  getUserShops,
  UserRole,
  AuthenticatedRequestWithRole,
} from './rbac.js';
import type { AuthenticatedRequest } from './auth.js';

// Mock Supabase connection
vi.mock('@/database/supabase/connection.js', () => ({
  supabaseConnection: {
    getServiceClient: vi.fn(),
  },
}));

// Mock logger
vi.mock('@/config/logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import mocked dependencies
import { supabaseConnection } from '@/database/supabase/connection.js';
import logger from '@/config/logger.js';

describe('RBAC Middleware', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: any;
  let statusMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockReq = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        account_id: 'account-456',
      },
      query: {},
      body: {},
      params: {},
      method: 'GET',
      path: '/api/test',
    };

    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    mockRes = {
      status: statusMock,
      json: jsonMock,
    };

    mockNext = vi.fn();
  });

  describe('requireRole - Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockReq.user = undefined;

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should proceed when user is authenticated', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'admin' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalledWith(401);
    });
  });

  describe('requireRole - Shop Name Resolution', () => {
    it('should use shop_name from query params', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockEq = vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { role: 'admin' },
          error: null,
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: mockEq,
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockFrom).toHaveBeenCalledWith('user_roles');
      expect(mockEq).toHaveBeenCalledWith('shop_name', 'test-shop.myshopify.com');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use shop_name from body', async () => {
      mockReq.body = { shop_name: 'body-shop.myshopify.com' };

      const mockEq = vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { role: 'admin' },
          error: null,
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: mockEq,
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockEq).toHaveBeenCalledWith('shop_name', 'body-shop.myshopify.com');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use shop_name from params', async () => {
      mockReq.params = { shop_name: 'params-shop.myshopify.com' };

      const mockEq = vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { role: 'admin' },
          error: null,
        }),
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: mockEq,
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockEq).toHaveBeenCalledWith('shop_name', 'params-shop.myshopify.com');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should resolve shop_name from account_id in query', async () => {
      mockReq.query = { account_id: 'account-789' };

      const mockFrom = vi
        .fn()
        // First call: getShopNameFromAccountId
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { shop_name: 'resolved-shop.myshopify.com' },
                error: null,
              }),
            }),
          }),
        })
        // Second call: getUserRoleForShop
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { role: 'admin' },
                  error: null,
                }),
              }),
            }),
          }),
        });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockFrom).toHaveBeenCalledWith('shopify_shops');
      expect(mockFrom).toHaveBeenCalledWith('user_roles');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should resolve shop_name from account_id in body', async () => {
      mockReq.body = { account_id: 'account-body-999' };

      const mockFrom = vi
        .fn()
        // First call: getShopNameFromAccountId
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { shop_name: 'body-resolved.myshopify.com' },
                error: null,
              }),
            }),
          }),
        })
        // Second call: getUserRoleForShop
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { role: 'editor' },
                  error: null,
                }),
              }),
            }),
          }),
        });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['editor']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should resolve shop_name from account_id in params', async () => {
      mockReq.params = { account_id: 'account-params-111' };

      const mockFrom = vi
        .fn()
        // First call: getShopNameFromAccountId
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { shop_name: 'params-resolved.myshopify.com' },
                error: null,
              }),
            }),
          }),
        })
        // Second call: getUserRoleForShop
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { role: 'viewer' },
                  error: null,
                }),
              }),
            }),
          }),
        });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['viewer']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should support legacy "account" parameter and resolve shop_name', async () => {
      mockReq.query = { account: 'legacy-account-222' };

      const mockFrom = vi
        .fn()
        // First call: getShopNameFromAccountId
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { shop_name: 'legacy-resolved.myshopify.com' },
                error: null,
              }),
            }),
          }),
        })
        // Second call: getUserRoleForShop
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { role: 'admin' },
                  error: null,
                }),
              }),
            }),
          }),
        });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 400 when no shop_name or account_id provided', async () => {
      mockReq.query = {};
      mockReq.body = {};
      mockReq.params = {};

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Either shop_name, account_id, or account is required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 404 when shop not found for account_id', async () => {
      mockReq.query = { account_id: 'invalid-account' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Shop not found for the provided account_id',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 404 when shop lookup fails with database error', async () => {
      mockReq.query = { account_id: 'error-account' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'DB_ERROR', message: 'Database error' },
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Shop not found for the provided account_id',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 404 when unexpected error occurs in getShopNameFromAccountId', async () => {
      mockReq.query = { account_id: 'crash-account' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation(() => {
            throw new Error('Catastrophic database failure');
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(404);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Shop not found for the provided account_id',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Unexpected error fetching shop name:',
        expect.any(Error)
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireRole - Role Fetching', () => {
    it('should fetch user role for shop successfully', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockEq1 = vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { role: 'admin' },
          error: null,
        }),
      });

      const mockEq2 = vi.fn().mockReturnValue({
        eq: mockEq1,
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: mockEq2,
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockFrom).toHaveBeenCalledWith('user_roles');
      expect(mockEq2).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockEq1).toHaveBeenCalledWith('shop_name', 'test-shop.myshopify.com');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when user has no role (PGRST116)', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'PGRST116' },
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Access denied: No permissions for this shop',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('User user-123 has no role for shop')
      );
    });

    it('should return 403 when database error fetching role', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: 'DB_ERROR', message: 'Database error' },
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Access denied: No permissions for this shop',
      });
      expect(logger.error).toHaveBeenCalledWith('Error fetching user role:', expect.any(Object));
    });

    it('should return 403 when role is null in data', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: null },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Access denied: No permissions for this shop',
      });
    });

    it('should return 403 when unexpected error occurs in getUserRoleForShop', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation(() => {
            throw new Error('Unexpected database error');
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Access denied: No permissions for this shop',
      });
      expect(logger.error).toHaveBeenCalledWith(
        'Unexpected error fetching user role:',
        expect.any(Error)
      );
    });
  });

  describe('requireRole - Role Authorization', () => {
    it('should grant access when user has allowed role', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'admin' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin', 'editor']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should deny access when user role not in allowedRoles', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'viewer' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Access denied: Insufficient permissions',
        required: ['admin'],
        current: 'viewer',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('User user-123 with role viewer denied access')
      );
    });

    it('should allow admin accessing admin endpoint', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'admin' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny editor accessing admin endpoint', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'editor' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Access denied: Insufficient permissions',
        required: ['admin'],
        current: 'editor',
      });
    });

    it('should deny viewer accessing admin endpoint', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'viewer' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('should allow admin accessing editor endpoint', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'admin' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin', 'editor']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow editor accessing editor endpoint', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'editor' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin', 'editor']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireRole - Request Enhancement', () => {
    it('should attach role to req.user', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'admin' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['admin']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as AuthenticatedRequestWithRole).user?.role).toBe('admin');
    });

    it('should attach shop_name to req.user', async () => {
      mockReq.query = { shop_name: 'my-test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'editor' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['editor']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as AuthenticatedRequestWithRole).user?.shop_name).toBe(
        'my-test-shop.myshopify.com'
      );
    });

    it('should attach both role and shop_name to req.user', async () => {
      mockReq.query = { shop_name: 'complete-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'viewer' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const middleware = requireRole(['viewer']);
      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      const reqWithRole = mockReq as AuthenticatedRequestWithRole;
      expect(reqWithRole.user?.role).toBe('viewer');
      expect(reqWithRole.user?.shop_name).toBe('complete-shop.myshopify.com');
      expect(reqWithRole.user?.id).toBe('user-123');
      expect(reqWithRole.user?.email).toBe('test@example.com');
    });
  });

  describe('Shorthand Middleware', () => {
    it('requireAdmin should only allow admin role', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'editor' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      await requireAdmin(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Access denied: Insufficient permissions',
        required: ['admin'],
        current: 'editor',
      });
    });

    it('requireAdmin should allow admin role', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'admin' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      await requireAdmin(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('requireEditor should allow admin and editor roles', async () => {
      // Test admin
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'admin' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      await requireEditor(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('requireEditor should deny viewer role', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'viewer' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      await requireEditor(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Access denied: Insufficient permissions',
        required: ['admin', 'editor'],
        current: 'viewer',
      });
    });

    it('requireAnyRole should allow admin, editor, and viewer roles', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { role: 'viewer' },
                error: null,
              }),
            }),
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      await requireAnyRole(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });
  });

  describe('hasRole Utility Function', () => {
    it('should return true when role is in allowedRoles', () => {
      expect(hasRole('admin', ['admin', 'editor'])).toBe(true);
      expect(hasRole('editor', ['admin', 'editor'])).toBe(true);
    });

    it('should return false when role is NOT in allowedRoles', () => {
      expect(hasRole('viewer', ['admin', 'editor'])).toBe(false);
    });

    it('should return false when role is undefined', () => {
      expect(hasRole(undefined, ['admin', 'editor'])).toBe(false);
    });

    it('should return false when allowedRoles is empty', () => {
      expect(hasRole('admin', [])).toBe(false);
    });

    it('should check multiple allowedRoles correctly', () => {
      expect(hasRole('admin', ['admin', 'editor', 'viewer'])).toBe(true);
      expect(hasRole('editor', ['admin', 'editor', 'viewer'])).toBe(true);
      expect(hasRole('viewer', ['admin', 'editor', 'viewer'])).toBe(true);
    });

    it('should handle single allowedRole', () => {
      expect(hasRole('admin', ['admin'])).toBe(true);
      expect(hasRole('editor', ['admin'])).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should return 500 when catastrophic error occurs in middleware', async () => {
      // Create a request object that will cause an error when accessed
      const badReq = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          account_id: 'account-456',
        },
        method: 'GET',
        path: '/api/test',
      } as any;

      // Set up a getter that throws when accessing query
      Object.defineProperty(badReq, 'query', {
        get() {
          throw new Error('Critical property access error');
        },
      });

      const middleware = requireRole(['admin']);
      await middleware(badReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(logger.error).toHaveBeenCalledWith('RBAC middleware error:', expect.any(Error));
    });
  });

  describe('getUserShops Function', () => {
    it('should return all shops for user with multiple shops', async () => {
      const mockShops = [
        { shop_name: 'shop1.myshopify.com', role: 'admin' as UserRole },
        { shop_name: 'shop2.myshopify.com', role: 'editor' as UserRole },
        { shop_name: 'shop3.myshopify.com', role: 'viewer' as UserRole },
      ];

      const mockOrder = vi.fn().mockResolvedValue({
        data: mockShops,
        error: null,
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: mockOrder,
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const result = await getUserShops('user-123');

      expect(result).toEqual(mockShops);
      expect(mockFrom).toHaveBeenCalledWith('user_roles');
      expect(mockOrder).toHaveBeenCalledWith('shop_name');
    });

    it('should return single shop for user with one shop', async () => {
      const mockShops = [{ shop_name: 'only-shop.myshopify.com', role: 'admin' as UserRole }];

      const mockOrder = vi.fn().mockResolvedValue({
        data: mockShops,
        error: null,
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: mockOrder,
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const result = await getUserShops('user-456');

      expect(result).toEqual(mockShops);
      expect(result.length).toBe(1);
    });

    it('should return empty array when user has no shops', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: [],
        error: null,
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: mockOrder,
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const result = await getUserShops('user-789');

      expect(result).toEqual([]);
    });

    it('should return empty array on database error', async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'DB_ERROR', message: 'Database error' },
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: mockOrder,
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const result = await getUserShops('user-error');

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching user shops:',
        expect.any(Object)
      );
    });

    it('should return empty array on unexpected error', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation(() => {
            throw new Error('Unexpected error');
          }),
        }),
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      const result = await getUserShops('user-crash');

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'Unexpected error fetching user shops:',
        expect.any(Error)
      );
    });

    it('should query with correct user_id', async () => {
      const mockEq = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      });

      const mockSelect = vi.fn().mockReturnValue({
        eq: mockEq,
      });

      const mockFrom = vi.fn().mockReturnValue({
        select: mockSelect,
      });

      vi.mocked(supabaseConnection.getServiceClient).mockReturnValue({ from: mockFrom } as any);

      await getUserShops('specific-user-id-999');

      expect(mockFrom).toHaveBeenCalledWith('user_roles');
      expect(mockSelect).toHaveBeenCalledWith('shop_name, role');
      expect(mockEq).toHaveBeenCalledWith('user_id', 'specific-user-id-999');
    });
  });
});
