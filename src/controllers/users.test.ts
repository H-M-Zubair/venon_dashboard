/**
 * Unit tests for UsersController
 *
 * Testing strategy:
 * - Mock UsersService static methods
 * - Mock Express req/res/next objects
 * - Mock authentication (req.user)
 * - Test all controller methods: getCurrentUser, getShopUsers, inviteUser, updateUserRole, removeUser
 * - Test authentication, validation, authorization, success scenarios, and error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';

// Mock dependencies BEFORE importing controller
vi.mock('@/services/users.js', () => ({
  UsersService: {
    getShopUsers: vi.fn(),
    inviteUserToShop: vi.fn(),
    updateUserRole: vi.fn(),
    removeUserFromShop: vi.fn(),
  },
}));

// Mock RBAC functions
vi.mock('@/middleware/rbac.js', async () => {
  const actual = await vi.importActual('@/middleware/rbac.js');
  return {
    ...actual,
    getUserRoleForShop: vi.fn(),
    getUserShops: vi.fn(),
  };
});

// Import AFTER mocks
import { UsersController } from './users.js';
import { UsersService } from '@/services/users.js';
import { AuthenticatedRequest } from '@/middleware/auth.js';
import { AuthenticatedRequestWithRole, getUserRoleForShop, getUserShops } from '@/middleware/rbac.js';
import { AppError } from '@/middleware/error.js';

describe('UsersController', () => {
  let controller: UsersController;
  let mockReq: Partial<AuthenticatedRequestWithRole>;
  let mockRes: Partial<Response>;
  let mockNext: any;

  const mockUsers = [
    { user_id: 'user-1', email: 'user1@example.com', shop_name: 'test-shop.myshopify.com', role: 'editor' as const },
    { user_id: 'user-2', email: 'user2@example.com', shop_name: 'test-shop.myshopify.com', role: 'viewer' as const },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    controller = new UsersController();

    // Reset RBAC mocks to default behavior (return empty array for getUserShops)
    vi.mocked(getUserShops).mockResolvedValue([]);
    vi.mocked(getUserRoleForShop).mockResolvedValue(null);

    // Mock request object
    mockReq = {
      user: {
        id: 'admin-123',
        email: 'admin@example.com',
        role: 'admin',
        shop_name: 'test-shop.myshopify.com',
      },
      query: {},
      body: {},
    };

    // Mock response object
    mockRes = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    // Mock next function
    mockNext = vi.fn();
  });

  describe('getCurrentUser', () => {
    it('should return current user information with all fields', async () => {
      // Mock getUserShops to return user's shops with roles
      vi.mocked(getUserShops).mockResolvedValue([
        { shop_name: 'test-shop.myshopify.com', role: 'admin' }
      ]);

      controller.getCurrentUser(
        mockReq as AuthenticatedRequest,
        mockRes as Response,
        mockNext
      );

      // Wait for async operations to complete
      await new Promise(resolve => setImmediate(resolve));

      // Verify getUserShops was called with user ID
      expect(getUserShops).toHaveBeenCalledWith('admin-123');

      expect(mockRes.json).toHaveBeenCalledWith({
        user: {
          id: 'admin-123',
          email: 'admin@example.com',
          role: 'admin',
          shop_name: 'test-shop.myshopify.com',
        },
      });
    });

    it('should return user information with null role and shop_name when not present', async () => {
      mockReq.user = {
        id: 'user-456',
        email: 'newuser@example.com',
      };

      // Mock getUserShops to return empty array (user has no shops/roles)
      vi.mocked(getUserShops).mockResolvedValue([]);

      controller.getCurrentUser(
        mockReq as AuthenticatedRequest,
        mockRes as Response,
        mockNext
      );

      // Wait for async operations to complete
      await new Promise(resolve => setImmediate(resolve));

      expect(mockRes.json).toHaveBeenCalledWith({
        user: {
          id: 'user-456',
          email: 'newuser@example.com',
          role: null,
          shop_name: null,
        },
      });
    });

    it('should throw 401 when user not authenticated', async () => {
      mockReq.user = undefined;

      await controller.getCurrentUser(
        mockReq as AuthenticatedRequest,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('User not authenticated');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('getShopUsers', () => {
    it('should return shop users for admin', async () => {
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };
      vi.mocked(UsersService.getShopUsers).mockResolvedValue(mockUsers);

      await controller.getShopUsers(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response
      );

      expect(UsersService.getShopUsers).toHaveBeenCalledWith('test-shop.myshopify.com');
      expect(mockRes.json).toHaveBeenCalledWith({ users: mockUsers });
    });

    it('should throw 400 when shop_name missing', async () => {
      mockReq.query = {};

      await controller.getShopUsers(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('shop_name is required');
      expect(error.statusCode).toBe(400);
    });

    it('should throw 403 when user not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      await controller.getShopUsers(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
    });

    it('should throw 403 when user not admin', async () => {
      mockReq.user!.role = 'editor';
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      await controller.getShopUsers(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
    });

    it('should throw 403 when admin for different shop', async () => {
      mockReq.user!.shop_name = 'other-shop.myshopify.com';
      mockReq.query = { shop_name: 'test-shop.myshopify.com' };

      await controller.getShopUsers(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('inviteUser', () => {
    it('should invite user successfully with valid data', async () => {
      mockReq.body = {
        email: 'newuser@example.com',
        shop_name: 'test-shop.myshopify.com',
        role: 'editor',
      };
      vi.mocked(UsersService.inviteUserToShop).mockResolvedValue();

      await controller.inviteUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response
      );

      expect(UsersService.inviteUserToShop).toHaveBeenCalledWith(
        'newuser@example.com',
        'test-shop.myshopify.com',
        'editor'
      );
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'User invited successfully' });
    });

    it('should normalize email to lowercase before inviting', async () => {
      mockReq.body = {
        email: 'NewUser@Example.COM ',
        shop_name: 'test-shop.myshopify.com',
        role: 'viewer',
      };
      vi.mocked(UsersService.inviteUserToShop).mockResolvedValue();

      await controller.inviteUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response
      );

      expect(UsersService.inviteUserToShop).toHaveBeenCalledWith(
        'newuser@example.com',
        'test-shop.myshopify.com',
        'viewer'
      );
    });

    it('should throw 400 when email missing', async () => {
      mockReq.body = {
        shop_name: 'test-shop.myshopify.com',
        role: 'editor',
      };

      await controller.inviteUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('email, shop_name, and role are required');
      expect(error.statusCode).toBe(400);
    });

    it('should throw 400 when shop_name missing', async () => {
      mockReq.body = {
        email: 'newuser@example.com',
        role: 'editor',
      };

      await controller.inviteUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('email, shop_name, and role are required');
      expect(error.statusCode).toBe(400);
    });

    it('should throw 400 when role missing', async () => {
      mockReq.body = {
        email: 'newuser@example.com',
        shop_name: 'test-shop.myshopify.com',
      };

      await controller.inviteUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('email, shop_name, and role are required');
      expect(error.statusCode).toBe(400);
    });

    it('should throw 400 when email format invalid', async () => {
      mockReq.body = {
        email: 'invalid-email',
        shop_name: 'test-shop.myshopify.com',
        role: 'editor',
      };

      await controller.inviteUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Invalid email format');
      expect(error.statusCode).toBe(400);
    });

    it('should throw 400 when role invalid', async () => {
      mockReq.body = {
        email: 'newuser@example.com',
        shop_name: 'test-shop.myshopify.com',
        role: 'superadmin',
      };

      await controller.inviteUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Invalid role. Must be admin, editor, or viewer');
      expect(error.statusCode).toBe(400);
    });

    it('should throw 403 when user not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.body = {
        email: 'newuser@example.com',
        shop_name: 'test-shop.myshopify.com',
        role: 'editor',
      };

      await controller.inviteUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
    });

    it('should throw 403 when user not admin', async () => {
      mockReq.user!.role = 'editor';
      mockReq.body = {
        email: 'newuser@example.com',
        shop_name: 'test-shop.myshopify.com',
        role: 'viewer',
      };

      await controller.inviteUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
    });

    it('should throw 403 when admin for different shop', async () => {
      mockReq.user!.shop_name = 'other-shop.myshopify.com';
      mockReq.body = {
        email: 'newuser@example.com',
        shop_name: 'test-shop.myshopify.com',
        role: 'editor',
      };

      await controller.inviteUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('updateUserRole', () => {
    it('should update user role successfully', async () => {
      mockReq.body = {
        user_id: 'user-1',
        shop_name: 'test-shop.myshopify.com',
        role: 'admin',
      };
      vi.mocked(UsersService.updateUserRole).mockResolvedValue();

      await controller.updateUserRole(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response
      );

      expect(UsersService.updateUserRole).toHaveBeenCalledWith(
        'user-1',
        'test-shop.myshopify.com',
        'admin'
      );
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Role updated successfully' });
    });

    it('should throw 400 when user_id missing', async () => {
      mockReq.body = {
        shop_name: 'test-shop.myshopify.com',
        role: 'editor',
      };

      await controller.updateUserRole(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('user_id, shop_name, and role are required');
      expect(error.statusCode).toBe(400);
    });

    it('should throw 400 when shop_name missing', async () => {
      mockReq.body = {
        user_id: 'user-1',
        role: 'editor',
      };

      await controller.updateUserRole(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('user_id, shop_name, and role are required');
      expect(error.statusCode).toBe(400);
    });

    it('should throw 400 when role missing', async () => {
      mockReq.body = {
        user_id: 'user-1',
        shop_name: 'test-shop.myshopify.com',
      };

      await controller.updateUserRole(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('user_id, shop_name, and role are required');
      expect(error.statusCode).toBe(400);
    });

    it('should throw 400 when role invalid', async () => {
      mockReq.body = {
        user_id: 'user-1',
        shop_name: 'test-shop.myshopify.com',
        role: 'superadmin',
      };

      await controller.updateUserRole(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Invalid role. Must be admin, editor, or viewer');
      expect(error.statusCode).toBe(400);
    });

    it('should throw 400 when trying to change own role', async () => {
      mockReq.body = {
        user_id: 'admin-123',
        shop_name: 'test-shop.myshopify.com',
        role: 'editor',
      };

      await controller.updateUserRole(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('You cannot change your own role');
      expect(error.statusCode).toBe(400);
    });

    it('should throw 403 when user not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.body = {
        user_id: 'user-1',
        shop_name: 'test-shop.myshopify.com',
        role: 'editor',
      };

      await controller.updateUserRole(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
    });

    it('should throw 403 when user not admin', async () => {
      mockReq.user!.role = 'editor';
      mockReq.body = {
        user_id: 'user-1',
        shop_name: 'test-shop.myshopify.com',
        role: 'viewer',
      };

      await controller.updateUserRole(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
    });

    it('should throw 403 when admin for different shop', async () => {
      mockReq.user!.shop_name = 'other-shop.myshopify.com';
      mockReq.body = {
        user_id: 'user-1',
        shop_name: 'test-shop.myshopify.com',
        role: 'editor',
      };

      await controller.updateUserRole(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
    });
  });

  describe('removeUser', () => {
    it('should remove user successfully', async () => {
      mockReq.body = {
        user_id: 'user-1',
        shop_name: 'test-shop.myshopify.com',
      };
      vi.mocked(UsersService.removeUserFromShop).mockResolvedValue();

      await controller.removeUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response
      );

      expect(UsersService.removeUserFromShop).toHaveBeenCalledWith(
        'user-1',
        'test-shop.myshopify.com'
      );
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'User removed successfully' });
    });

    it('should throw 400 when user_id missing', async () => {
      mockReq.body = {
        shop_name: 'test-shop.myshopify.com',
      };

      await controller.removeUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('user_id and shop_name are required');
      expect(error.statusCode).toBe(400);
    });

    it('should throw 400 when shop_name missing', async () => {
      mockReq.body = {
        user_id: 'user-1',
      };

      await controller.removeUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('user_id and shop_name are required');
      expect(error.statusCode).toBe(400);
    });

    it('should throw 400 when trying to remove self', async () => {
      mockReq.body = {
        user_id: 'admin-123',
        shop_name: 'test-shop.myshopify.com',
      };

      await controller.removeUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('You cannot remove yourself');
      expect(error.statusCode).toBe(400);
    });

    it('should throw 403 when user not authenticated', async () => {
      mockReq.user = undefined;
      mockReq.body = {
        user_id: 'user-1',
        shop_name: 'test-shop.myshopify.com',
      };

      await controller.removeUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
    });

    it('should throw 403 when user not admin', async () => {
      mockReq.user!.role = 'editor';
      mockReq.body = {
        user_id: 'user-1',
        shop_name: 'test-shop.myshopify.com',
      };

      await controller.removeUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
    });

    it('should throw 403 when admin for different shop', async () => {
      mockReq.user!.shop_name = 'other-shop.myshopify.com';
      mockReq.body = {
        user_id: 'user-1',
        shop_name: 'test-shop.myshopify.com',
      };

      await controller.removeUser(
        mockReq as AuthenticatedRequestWithRole,
        mockRes as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      const error = mockNext.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
    });
  });
});
