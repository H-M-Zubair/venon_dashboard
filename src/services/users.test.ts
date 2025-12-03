/**
 * Unit tests for UsersService
 *
 * Testing strategy:
 * - Mock Supabase connection and auth
 * - Test getShopUsers with email fetching
 * - Test inviteUserToShop with pagination, validation, and duplicate checks
 * - Test updateUserRole with validation
 * - Test removeUserFromShop with last admin protection
 * - Test error scenarios for all methods
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@/database/supabase/connection', () => ({
  supabaseConnection: {
    getServiceClient: vi.fn(),
  },
}));

// Import after mocks
import { UsersService } from './users.js';
import { supabaseConnection } from '@/database/supabase/connection';

describe('UsersService', () => {
  let mockSupabaseClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Supabase client
    mockSupabaseClient = {
      from: vi.fn(),
      auth: {
        admin: {
          getUserById: vi.fn(),
          listUsers: vi.fn(),
        },
      },
    };

    vi.mocked(supabaseConnection.getServiceClient).mockReturnValue(mockSupabaseClient);
  });

  describe('getShopUsers', () => {
    const mockUserRoles = [
      { user_id: 'user-1', shop_name: 'test-shop.myshopify.com', role: 'admin' },
      { user_id: 'user-2', shop_name: 'test-shop.myshopify.com', role: 'editor' },
    ];

    describe('Success Scenarios', () => {
      it('should fetch shop users with emails successfully', async () => {
        const rolesChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: mockUserRoles,
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(rolesChain);
        mockSupabaseClient.auth.admin.getUserById
          .mockResolvedValueOnce({
            data: { user: { email: 'user1@example.com' } },
            error: null,
          })
          .mockResolvedValueOnce({
            data: { user: { email: 'user2@example.com' } },
            error: null,
          });

        const result = await UsersService.getShopUsers('test-shop.myshopify.com');

        expect(result).toHaveLength(2);
        expect(result[0].email).toBe('user1@example.com');
        expect(result[1].email).toBe('user2@example.com');
      });

      it('should return empty array when no users found', async () => {
        const rolesChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(rolesChain);

        const result = await UsersService.getShopUsers('empty-shop.myshopify.com');

        expect(result).toEqual([]);
      });

      it('should return empty array when user roles data is null', async () => {
        const rolesChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(rolesChain);

        const result = await UsersService.getShopUsers('empty-shop.myshopify.com');

        expect(result).toEqual([]);
      });

      it('should handle getUserById error gracefully with "Unknown" email', async () => {
        const rolesChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [mockUserRoles[0]],
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(rolesChain);
        mockSupabaseClient.auth.admin.getUserById.mockResolvedValue({
          data: { user: null },
          error: { message: 'User not found' },
        });

        const result = await UsersService.getShopUsers('test-shop.myshopify.com');

        expect(result).toHaveLength(1);
        expect(result[0].email).toBe('Unknown');
      });

      it('should handle getUserById returning null user with "Unknown" email', async () => {
        const rolesChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [mockUserRoles[0]],
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(rolesChain);
        mockSupabaseClient.auth.admin.getUserById.mockResolvedValue({
          data: { user: null },
          error: null,
        });

        const result = await UsersService.getShopUsers('test-shop.myshopify.com');

        expect(result).toHaveLength(1);
        expect(result[0].email).toBe('Unknown');
      });

      it('should handle getUserById exception with "Unknown" email', async () => {
        const rolesChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [mockUserRoles[0]],
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(rolesChain);
        mockSupabaseClient.auth.admin.getUserById.mockRejectedValue(
          new Error('Connection failed')
        );

        const result = await UsersService.getShopUsers('test-shop.myshopify.com');

        expect(result).toHaveLength(1);
        expect(result[0].email).toBe('Unknown');
      });

      it('should filter out support@venon.io users', async () => {
        const rolesWithSupport = [
          ...mockUserRoles,
          { user_id: 'support-user', shop_name: 'test-shop.myshopify.com', role: 'admin' },
        ];

        const rolesChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: rolesWithSupport,
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(rolesChain);
        mockSupabaseClient.auth.admin.getUserById
          .mockResolvedValueOnce({
            data: { user: { email: 'user1@example.com' } },
            error: null,
          })
          .mockResolvedValueOnce({
            data: { user: { email: 'user2@example.com' } },
            error: null,
          })
          .mockResolvedValueOnce({
            data: { user: { email: 'support@venon.io' } },
            error: null,
          });

        const result = await UsersService.getShopUsers('test-shop.myshopify.com');

        expect(result).toHaveLength(2);
        expect(result.find((u) => u.email === 'support@venon.io')).toBeUndefined();
      });
    });

    describe('Error Handling', () => {
      it('should throw error when user roles fetch fails', async () => {
        const rolesChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' },
          }),
        };

        mockSupabaseClient.from.mockReturnValue(rolesChain);

        await expect(UsersService.getShopUsers('test-shop.myshopify.com')).rejects.toThrow(
          'Failed to fetch shop users'
        );
      });

      it('should propagate unexpected errors', async () => {
        mockSupabaseClient.from.mockImplementation(() => {
          throw new Error('Connection failed');
        });

        await expect(UsersService.getShopUsers('test-shop.myshopify.com')).rejects.toThrow(
          'Connection failed'
        );
      });
    });

    describe('Query Construction', () => {
      it('should query user_roles table with shop_name', async () => {
        const rolesChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(rolesChain);

        await UsersService.getShopUsers('my-shop.myshopify.com');

        expect(mockSupabaseClient.from).toHaveBeenCalledWith('user_roles');
        expect(rolesChain.eq).toHaveBeenCalledWith('shop_name', 'my-shop.myshopify.com');
      });
    });
  });

  describe('inviteUserToShop', () => {
    const mockAuthUser = {
      id: 'user-123',
      email: 'test@example.com',
    };

    describe('Success Scenarios', () => {
      it('should invite user successfully when user exists and has no role', async () => {
        mockSupabaseClient.auth.admin.listUsers.mockResolvedValue({
          data: { users: [mockAuthUser] },
          error: null,
        });

        const roleCheckChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' }, // Not found error
          }),
        };

        const insertChain = {
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(roleCheckChain)
          .mockReturnValueOnce(insertChain);

        await UsersService.inviteUserToShop(
          'test@example.com',
          'test-shop.myshopify.com',
          'editor'
        );

        expect(insertChain.insert).toHaveBeenCalledWith({
          user_id: 'user-123',
          shop_name: 'test-shop.myshopify.com',
          role: 'editor',
        });
      });

      it('should normalize email to lowercase', async () => {
        mockSupabaseClient.auth.admin.listUsers.mockResolvedValue({
          data: { users: [{ id: 'user-123', email: 'Test@Example.com' }] },
          error: null,
        });

        const roleCheckChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
        };

        const insertChain = {
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(roleCheckChain)
          .mockReturnValueOnce(insertChain);

        await UsersService.inviteUserToShop('Test@Example.COM  ', 'test-shop', 'editor');

        expect(mockSupabaseClient.auth.admin.listUsers).toHaveBeenCalled();
      });

      it('should handle pagination when user is found in later pages', async () => {
        mockSupabaseClient.auth.admin.listUsers
          .mockResolvedValueOnce({
            data: { users: Array(500).fill({ id: 'other', email: 'other@example.com' }) },
            error: null,
          })
          .mockResolvedValueOnce({
            data: { users: [mockAuthUser] },
            error: null,
          });

        const roleCheckChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
        };

        const insertChain = {
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(roleCheckChain)
          .mockReturnValueOnce(insertChain);

        await UsersService.inviteUserToShop(
          'test@example.com',
          'test-shop.myshopify.com',
          'viewer'
        );

        expect(mockSupabaseClient.auth.admin.listUsers).toHaveBeenCalledTimes(2);
        expect(mockSupabaseClient.auth.admin.listUsers).toHaveBeenNthCalledWith(1, {
          page: 1,
          perPage: 500,
        });
        expect(mockSupabaseClient.auth.admin.listUsers).toHaveBeenNthCalledWith(2, {
          page: 2,
          perPage: 500,
        });
      });
    });

    describe('Validation', () => {
      it('should throw error when user does not exist', async () => {
        mockSupabaseClient.auth.admin.listUsers.mockResolvedValue({
          data: { users: [{ id: 'other', email: 'other@example.com' }] },
          error: null,
        });

        await expect(
          UsersService.inviteUserToShop('nonexistent@example.com', 'test-shop', 'editor')
        ).rejects.toThrow('User does not exist');
      });

      it('should throw error when user already has role for shop', async () => {
        mockSupabaseClient.auth.admin.listUsers.mockResolvedValue({
          data: { users: [mockAuthUser] },
          error: null,
        });

        const roleCheckChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(roleCheckChain);

        await expect(
          UsersService.inviteUserToShop('test@example.com', 'test-shop', 'editor')
        ).rejects.toThrow('User already has access to this shop');
      });
    });

    describe('Error Handling', () => {
      it('should throw error when listUsers fails', async () => {
        mockSupabaseClient.auth.admin.listUsers.mockResolvedValue({
          data: { users: [] },
          error: { message: 'Auth error' },
        });

        await expect(
          UsersService.inviteUserToShop('test@example.com', 'test-shop', 'editor')
        ).rejects.toThrow('Failed to check user existence');
      });

      it('should throw error when role check fails (non-404 error)', async () => {
        mockSupabaseClient.auth.admin.listUsers.mockResolvedValue({
          data: { users: [mockAuthUser] },
          error: null,
        });

        const roleCheckChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'OTHER_ERROR', message: 'Database error' },
          }),
        };

        mockSupabaseClient.from.mockReturnValue(roleCheckChain);

        await expect(
          UsersService.inviteUserToShop('test@example.com', 'test-shop', 'editor')
        ).rejects.toThrow('Failed to check existing role');
      });

      it('should throw error when insert fails', async () => {
        mockSupabaseClient.auth.admin.listUsers.mockResolvedValue({
          data: { users: [mockAuthUser] },
          error: null,
        });

        const roleCheckChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          }),
        };

        const insertChain = {
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Insert failed' },
          }),
        };

        mockSupabaseClient.from
          .mockReturnValueOnce(roleCheckChain)
          .mockReturnValueOnce(insertChain);

        await expect(
          UsersService.inviteUserToShop('test@example.com', 'test-shop', 'editor')
        ).rejects.toThrow('Failed to add user to shop');
      });
    });
  });

  describe('updateUserRole', () => {
    describe('Success Scenarios', () => {
      it('should update user role successfully', async () => {
        const roleCheckChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { role: 'editor' },
            error: null,
          }),
        };

        const updateChain = {
          update: vi.fn(),
          eq: vi.fn(),
        };

        // Setup chain: update() -> eq() -> eq()
        updateChain.update.mockReturnValue(updateChain);
        updateChain.eq.mockReturnValueOnce(updateChain).mockResolvedValue({
          data: null,
          error: null,
        });

        mockSupabaseClient.from
          .mockReturnValueOnce(roleCheckChain)
          .mockReturnValueOnce(updateChain);

        await UsersService.updateUserRole('user-123', 'test-shop.myshopify.com', 'admin');

        expect(updateChain.update).toHaveBeenCalledWith({ role: 'admin' });
      });
    });

    describe('Validation', () => {
      it('should throw error when user role not found (error)', async () => {
        const roleCheckChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Not found' },
          }),
        };

        mockSupabaseClient.from.mockReturnValue(roleCheckChain);

        await expect(
          UsersService.updateUserRole('user-999', 'test-shop', 'admin')
        ).rejects.toThrow('User role not found for this shop');
      });

      it('should throw error when user role not found (no data)', async () => {
        const roleCheckChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        };

        mockSupabaseClient.from.mockReturnValue(roleCheckChain);

        await expect(
          UsersService.updateUserRole('user-999', 'test-shop', 'admin')
        ).rejects.toThrow('User role not found for this shop');
      });
    });

    describe('Error Handling', () => {
      it('should throw error when update fails', async () => {
        const roleCheckChain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { role: 'editor' },
            error: null,
          }),
        };

        const updateChain = {
          update: vi.fn(),
          eq: vi.fn(),
        };

        updateChain.update.mockReturnValue(updateChain);
        updateChain.eq.mockReturnValueOnce(updateChain).mockResolvedValue({
          data: null,
          error: { message: 'Update failed' },
        });

        mockSupabaseClient.from
          .mockReturnValueOnce(roleCheckChain)
          .mockReturnValueOnce(updateChain);

        await expect(
          UsersService.updateUserRole('user-123', 'test-shop', 'admin')
        ).rejects.toThrow('Failed to update user role');
      });

      it('should propagate unexpected errors', async () => {
        mockSupabaseClient.from.mockImplementation(() => {
          throw new Error('Connection failed');
        });

        await expect(
          UsersService.updateUserRole('user-123', 'test-shop', 'admin')
        ).rejects.toThrow('Connection failed');
      });
    });
  });

  describe('removeUserFromShop', () => {
    describe('Success Scenarios', () => {
      it('should remove user from shop when not last admin', async () => {
        const adminCheckChain = {
          select: vi.fn(),
          eq: vi.fn(),
        };

        // Setup chain: select() -> eq() -> eq()
        adminCheckChain.select.mockReturnValue(adminCheckChain);
        adminCheckChain.eq.mockReturnValueOnce(adminCheckChain).mockResolvedValue({
          data: [{ user_id: 'admin-1' }, { user_id: 'admin-2' }],
          error: null,
        });

        const deleteChain = {
          delete: vi.fn(),
          eq: vi.fn(),
        };

        // Setup chain: delete() -> eq() -> eq()
        deleteChain.delete.mockReturnValue(deleteChain);
        deleteChain.eq.mockReturnValueOnce(deleteChain).mockResolvedValue({
          data: null,
          error: null,
        });

        mockSupabaseClient.from
          .mockReturnValueOnce(adminCheckChain)
          .mockReturnValueOnce(deleteChain);

        await UsersService.removeUserFromShop('admin-1', 'test-shop.myshopify.com');

        expect(deleteChain.delete).toHaveBeenCalled();
      });

      it('should remove non-admin user successfully', async () => {
        const adminCheckChain = {
          select: vi.fn(),
          eq: vi.fn(),
        };

        adminCheckChain.select.mockReturnValue(adminCheckChain);
        adminCheckChain.eq.mockReturnValueOnce(adminCheckChain).mockResolvedValue({
          data: [{ user_id: 'admin-1' }],
          error: null,
        });

        const deleteChain = {
          delete: vi.fn(),
          eq: vi.fn(),
        };

        deleteChain.delete.mockReturnValue(deleteChain);
        deleteChain.eq.mockReturnValueOnce(deleteChain).mockResolvedValue({
          data: null,
          error: null,
        });

        mockSupabaseClient.from
          .mockReturnValueOnce(adminCheckChain)
          .mockReturnValueOnce(deleteChain);

        await UsersService.removeUserFromShop('editor-1', 'test-shop.myshopify.com');

        expect(deleteChain.delete).toHaveBeenCalled();
      });
    });

    describe('Validation', () => {
      it('should throw error when removing last admin', async () => {
        const adminCheckChain = {
          select: vi.fn(),
          eq: vi.fn(),
        };

        adminCheckChain.select.mockReturnValue(adminCheckChain);
        adminCheckChain.eq.mockReturnValueOnce(adminCheckChain).mockResolvedValue({
          data: [{ user_id: 'admin-1' }],
          error: null,
        });

        mockSupabaseClient.from.mockReturnValue(adminCheckChain);

        await expect(
          UsersService.removeUserFromShop('admin-1', 'test-shop.myshopify.com')
        ).rejects.toThrow('Cannot remove the last admin from the shop');
      });
    });

    describe('Error Handling', () => {
      it('should throw error when admin check fails', async () => {
        const adminCheckChain = {
          select: vi.fn(),
          eq: vi.fn(),
        };

        adminCheckChain.select.mockReturnValue(adminCheckChain);
        adminCheckChain.eq.mockReturnValueOnce(adminCheckChain).mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        });

        mockSupabaseClient.from.mockReturnValue(adminCheckChain);

        await expect(
          UsersService.removeUserFromShop('user-1', 'test-shop')
        ).rejects.toThrow('Failed to check admin count');
      });

      it('should throw error when delete fails', async () => {
        const adminCheckChain = {
          select: vi.fn(),
          eq: vi.fn(),
        };

        adminCheckChain.select.mockReturnValue(adminCheckChain);
        adminCheckChain.eq.mockReturnValueOnce(adminCheckChain).mockResolvedValue({
          data: [{ user_id: 'admin-1' }, { user_id: 'admin-2' }],
          error: null,
        });

        const deleteChain = {
          delete: vi.fn(),
          eq: vi.fn(),
        };

        deleteChain.delete.mockReturnValue(deleteChain);
        deleteChain.eq.mockReturnValueOnce(deleteChain).mockResolvedValue({
          data: null,
          error: { message: 'Delete failed' },
        });

        mockSupabaseClient.from
          .mockReturnValueOnce(adminCheckChain)
          .mockReturnValueOnce(deleteChain);

        await expect(
          UsersService.removeUserFromShop('admin-1', 'test-shop')
        ).rejects.toThrow('Failed to remove user from shop');
      });

      it('should propagate unexpected errors', async () => {
        mockSupabaseClient.from.mockImplementation(() => {
          throw new Error('Connection failed');
        });

        await expect(
          UsersService.removeUserFromShop('user-1', 'test-shop')
        ).rejects.toThrow('Connection failed');
      });
    });
  });
});
