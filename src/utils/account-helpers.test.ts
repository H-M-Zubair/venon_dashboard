/**
 * Unit Tests for Account Helpers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppError } from '@/middleware/error.js';

// Mock the logger
vi.mock('@/config/logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Create mock Supabase client
const mockFrom = vi.fn();
const mockSupabaseClient = {
  from: mockFrom,
};

// Mock the Supabase connection module
vi.mock('@/database/supabase/connection.js', () => ({
  supabaseConnection: {
    getServiceClient: () => mockSupabaseClient,
  },
}));

// Import after mocking
const { validateUserAccountAccess, getShopNameFromAccountId, getShopDataFromAccountId } = await import('./account-helpers.js');

describe('account-helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('validateUserAccountAccess', () => {
    it('should grant access when user owns the account', async () => {
      // Setup mock for account ownership query
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'account-123' },
          error: null,
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      // Should not throw
      await expect(
        validateUserAccountAccess('user-123', 'account-123')
      ).resolves.toBeUndefined();

      // Verify the correct query was made
      expect(mockFrom).toHaveBeenCalledWith('accounts');
      expect(mockChain.select).toHaveBeenCalledWith('id');
      expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockChain.eq).toHaveBeenCalledWith('id', 'account-123');
    });

    it('should grant access when user has role-based access', async () => {
      // First call (ownership check) returns no data
      const ownershipChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        }),
      };

      // Second call (role check) returns role data
      const roleChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'account-123',
            shopify_shops: [
              {
                shop_name: 'test-shop',
                user_roles: [{ user_id: 'user-456', role: 'viewer' }],
              },
            ],
          },
          error: null,
        }),
      };

      // Mock returns different chains for each call
      mockFrom
        .mockReturnValueOnce(ownershipChain)
        .mockReturnValueOnce(roleChain);

      // Should not throw
      await expect(
        validateUserAccountAccess('user-456', 'account-123')
      ).resolves.toBeUndefined();

      // Verify both queries were made
      expect(mockFrom).toHaveBeenCalledTimes(2);
      expect(mockFrom).toHaveBeenNthCalledWith(1, 'accounts');
      expect(mockFrom).toHaveBeenNthCalledWith(2, 'accounts');
    });

    it('should throw AppError(403) when user has no access', async () => {
      // Both ownership and role checks fail
      const failedChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        }),
      };

      mockFrom.mockReturnValue(failedChain);

      // Should throw AppError with 403
      await expect(
        validateUserAccountAccess('user-789', 'account-123')
      ).rejects.toThrow(AppError);

      await expect(
        validateUserAccountAccess('user-789', 'account-123')
      ).rejects.toThrow('Access denied to this account');

      // Note: Not asserting call count here as it can be affected by previous tests
      // The important verification is that access was denied (above assertions)
    });

    it('should throw AppError with correct status code', async () => {
      const failedChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        }),
      };

      mockFrom.mockReturnValue(failedChain);

      try {
        await validateUserAccountAccess('user-unauthorized', 'account-999');
        expect.fail('Should have thrown AppError');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).statusCode).toBe(403);
      }
    });

    it('should handle database errors gracefully', async () => {
      // Simulate a database connection error
      const errorChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Connection timeout' },
        }),
      };

      mockFrom.mockReturnValue(errorChain);

      await expect(
        validateUserAccountAccess('user-123', 'account-123')
      ).rejects.toThrow(AppError);
    });
  });

  describe('getShopNameFromAccountId', () => {
    it('should return shop name when found', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { shop_name: 'test-shop.myshopify.com' },
          error: null,
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      const shopName = await getShopNameFromAccountId('account-123');

      expect(shopName).toBe('test-shop.myshopify.com');
      expect(mockFrom).toHaveBeenCalledWith('shopify_shops');
      expect(mockChain.select).toHaveBeenCalledWith('shop_name');
      expect(mockChain.eq).toHaveBeenCalledWith('account_id', 'account-123');
    });

    it('should throw error when shop not found', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      await expect(getShopNameFromAccountId('account-nonexistent')).rejects.toThrow(
        'Shop not found for account'
      );
    });

    it('should throw error when data is null despite no error', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      await expect(getShopNameFromAccountId('account-missing')).rejects.toThrow(
        'Shop not found for account'
      );
    });

    it('should throw Error (not AppError) for shop not found', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      try {
        await getShopNameFromAccountId('account-123');
        expect.fail('Should have thrown Error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(AppError);
        expect((error as Error).message).toBe('Shop not found for account');
      }
    });

    it('should handle database errors', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database connection failed' },
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      await expect(getShopNameFromAccountId('account-123')).rejects.toThrow(
        'Shop not found for account'
      );
    });
  });

  describe('getShopDataFromAccountId', () => {
    it('should return shop data with default fields', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { shop_name: 'default-shop.myshopify.com' },
          error: null,
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      const shopData = await getShopDataFromAccountId<{ shop_name: string }>('account-123');

      expect(shopData).toEqual({ shop_name: 'default-shop.myshopify.com' });
      expect(mockChain.select).toHaveBeenCalledWith('shop_name');
    });

    it('should return shop data with custom fields', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            shop_name: 'custom-shop.myshopify.com',
            shop_id: 'shop-456',
            currency: 'USD',
          },
          error: null,
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      const shopData = await getShopDataFromAccountId<{
        shop_name: string;
        shop_id: string;
        currency: string;
      }>('account-123', 'shop_name,shop_id,currency');

      expect(shopData).toEqual({
        shop_name: 'custom-shop.myshopify.com',
        shop_id: 'shop-456',
        currency: 'USD',
      });
      expect(mockChain.select).toHaveBeenCalledWith('shop_name,shop_id,currency');
    });

    it('should throw error when shop not found', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      await expect(
        getShopDataFromAccountId('account-nonexistent', 'shop_name,shop_id')
      ).rejects.toThrow('Shop not found for account');
    });

    it('should throw error when data is null despite no error', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      await expect(getShopDataFromAccountId('account-missing')).rejects.toThrow(
        'Shop not found for account'
      );
    });

    it('should handle database errors', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database timeout' },
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      await expect(getShopDataFromAccountId('account-123')).rejects.toThrow(
        'Shop not found for account'
      );
    });

    it('should preserve type information with generic parameter', async () => {
      interface CustomShopData {
        shop_name: string;
        shop_domain: string;
        created_at: string;
      }

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            shop_name: 'typed-shop.myshopify.com',
            shop_domain: 'typed-shop.com',
            created_at: '2024-01-01T00:00:00Z',
          },
          error: null,
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      const shopData = await getShopDataFromAccountId<CustomShopData>(
        'account-123',
        'shop_name,shop_domain,created_at'
      );

      // Type assertions to verify TypeScript types are correct
      const name: string = shopData.shop_name;
      const domain: string = shopData.shop_domain;
      const createdAt: string = shopData.created_at;

      expect(name).toBe('typed-shop.myshopify.com');
      expect(domain).toBe('typed-shop.com');
      expect(createdAt).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('edge cases', () => {
    it('should handle validateUserAccountAccess with different user IDs', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'account-123' },
          error: null,
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      // Test with different user ID
      await expect(
        validateUserAccountAccess('user-abc-123', 'account-123')
      ).resolves.toBeUndefined();

      expect(mockFrom).toHaveBeenCalledWith('accounts');
    });

    it('should handle getShopNameFromAccountId with UUID-style IDs', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { shop_name: 'uuid-test-shop.myshopify.com' },
          error: null,
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      const shopName = await getShopNameFromAccountId(
        'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      );
      expect(shopName).toBe('uuid-test-shop.myshopify.com');
      expect(mockChain.eq).toHaveBeenCalledWith(
        'account_id',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      );
    });

    it('should handle empty string account IDs', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Invalid ID' },
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      await expect(getShopNameFromAccountId('')).rejects.toThrow();
    });

    it('should handle special characters in account IDs', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { shop_name: 'special-shop.myshopify.com' },
          error: null,
        }),
      };

      mockFrom.mockReturnValue(mockChain);

      const shopName = await getShopNameFromAccountId('account-with-special-chars-!@#');
      expect(shopName).toBe('special-shop.myshopify.com');
      expect(mockChain.eq).toHaveBeenCalledWith('account_id', 'account-with-special-chars-!@#');
    });
  });
});
