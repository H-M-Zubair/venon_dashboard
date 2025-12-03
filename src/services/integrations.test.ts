/**
 * Unit tests for Integration utilities
 *
 * Testing strategy:
 * - Mock Supabase connection
 * - Test successful integration fetch
 * - Test integration not found scenarios
 * - Test error handling
 * - Verify query construction
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@/database/supabase/connection.js', () => ({
  supabaseConnection: {
    getServiceClient: vi.fn(),
  },
}));

// Import after mocks
import { getIntegrationData } from './integrations.js';
import { supabaseConnection } from '@/database/supabase/connection.js';

describe('getIntegrationData', () => {
  let mockSupabaseClient: any;

  const mockIntegration = {
    id: 1,
    access_token: 'test-access-token',
    account_id: 123,
    ad_account_id: 'ad-account-456',
    client_id: 'client-789',
    client_secret: 'client-secret-abc',
    connected: true,
    error: null,
    expires_at: '2024-12-31T23:59:59Z',
    external_user_id: 'external-user-123',
    type: 'google-ads',
    refresh_token: 'refresh-token-xyz',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Supabase client
    mockSupabaseClient = {
      from: vi.fn(),
    };

    vi.mocked(supabaseConnection.getServiceClient).mockReturnValue(mockSupabaseClient);
  });

  describe('Success Scenarios', () => {
    it('should fetch integration data successfully', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockIntegration,
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue(chain);

      const result = await getIntegrationData('google-ads', 123);

      expect(result).toEqual(mockIntegration);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('integrations');
      expect(chain.select).toHaveBeenCalledWith(expect.stringContaining('access_token'));
      expect(chain.eq).toHaveBeenCalledWith('type', 'google-ads');
      expect(chain.eq).toHaveBeenCalledWith('account_id', 123);
    });

    it('should fetch meta-ads integration', async () => {
      const metaIntegration = {
        ...mockIntegration,
        type: 'meta-ads',
      };

      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: metaIntegration,
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue(chain);

      const result = await getIntegrationData('meta-ads', 456);

      expect(result?.type).toBe('meta-ads');
      expect(chain.eq).toHaveBeenCalledWith('type', 'meta-ads');
      expect(chain.eq).toHaveBeenCalledWith('account_id', 456);
    });

    it('should include all required fields in select', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockIntegration,
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue(chain);

      await getIntegrationData('google-ads', 123);

      const selectCall = chain.select.mock.calls[0][0];
      expect(selectCall).toContain('id');
      expect(selectCall).toContain('access_token');
      expect(selectCall).toContain('account_id');
      expect(selectCall).toContain('ad_account_id');
      expect(selectCall).toContain('client_id');
      expect(selectCall).toContain('client_secret');
      expect(selectCall).toContain('connected');
      expect(selectCall).toContain('error');
      expect(selectCall).toContain('expires_at');
      expect(selectCall).toContain('external_user_id');
      expect(selectCall).toContain('type');
      expect(selectCall).toContain('refresh_token');
    });
  });

  describe('Not Found Scenarios', () => {
    it('should return null when integration not found (Supabase error)', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        }),
      };

      mockSupabaseClient.from.mockReturnValue(chain);

      const result = await getIntegrationData('google-ads', 999);

      expect(result).toBeNull();
    });

    it('should return null when integration not found (no data)', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue(chain);

      const result = await getIntegrationData('tiktok-ads', 123);

      expect(result).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should return null when Supabase query fails', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      };

      mockSupabaseClient.from.mockReturnValue(chain);

      const result = await getIntegrationData('google-ads', 123);

      expect(result).toBeNull();
    });

    it('should return null when unexpected error occurs', async () => {
      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await getIntegrationData('google-ads', 123);

      expect(result).toBeNull();
    });

    it('should handle non-Error exceptions', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockRejectedValue('String error'),
      };

      mockSupabaseClient.from.mockReturnValue(chain);

      const result = await getIntegrationData('google-ads', 123);

      expect(result).toBeNull();
    });
  });

  describe('Query Construction', () => {
    it('should use single() to fetch one record', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockIntegration,
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue(chain);

      await getIntegrationData('google-ads', 123);

      expect(chain.single).toHaveBeenCalled();
    });

    it('should filter by both type and account_id', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockIntegration,
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue(chain);

      await getIntegrationData('meta-ads', 789);

      expect(chain.eq).toHaveBeenCalledTimes(2);
      expect(chain.eq).toHaveBeenNthCalledWith(1, 'type', 'meta-ads');
      expect(chain.eq).toHaveBeenNthCalledWith(2, 'account_id', 789);
    });

    it('should query integrations table', async () => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockIntegration,
          error: null,
        }),
      };

      mockSupabaseClient.from.mockReturnValue(chain);

      await getIntegrationData('google-ads', 123);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('integrations');
    });
  });
});
