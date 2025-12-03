/**
 * Unit tests for AdService
 *
 * Testing strategy:
 * - Mock Supabase connection for database queries
 * - Mock Google Ads and Meta Ads platform integration functions
 * - Mock logger for error tracking
 * - Test all public static methods with various scenarios
 * - Test platform-specific behavior (Google vs Meta)
 * - Test error handling: not found, unsupported provider, database errors
 * - Test the two-step update pattern: platform update → database update
 * - Verify proper data flow and transformations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Campaign, AdSet, Ad, AdProvider } from '@/types/ads';

// Mock dependencies before importing
vi.mock('@/database/supabase/connection', () => ({
  supabaseConnection: {
    getServiceClient: vi.fn(),
  },
}));

vi.mock('@/services/ad-platforms/google', () => ({
  updateGoogleCampaignStatus: vi.fn(),
  updateGoogleCampaignBudget: vi.fn(),
  updateGoogleAdSetStatus: vi.fn(),
  updateGoogleAdStatus: vi.fn(),
}));

vi.mock('@/services/ad-platforms/meta', () => ({
  updateMetaCampaignStatus: vi.fn(),
  updateMetaCampaignBudget: vi.fn(),
  updateMetaAdSetStatus: vi.fn(),
  updateMetaAdSetBudget: vi.fn(),
  updateMetaAdStatus: vi.fn(),
}));

vi.mock('@/config/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Import after mocks
import { AdService } from './ads';
import { supabaseConnection } from '@/database/supabase/connection';
import {
  updateGoogleCampaignStatus,
  updateGoogleCampaignBudget,
  updateGoogleAdSetStatus,
  updateGoogleAdStatus,
} from '@/services/ad-platforms/google';
import {
  updateMetaCampaignStatus,
  updateMetaCampaignBudget,
  updateMetaAdSetStatus,
  updateMetaAdSetBudget,
  updateMetaAdStatus,
} from '@/services/ad-platforms/meta';
import logger from '@/config/logger';

describe('AdService', () => {
  let mockSupabaseClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Supabase client - only need to mock from()
    mockSupabaseClient = {
      from: vi.fn(),
    };

    vi.mocked(supabaseConnection.getServiceClient).mockReturnValue(mockSupabaseClient);
  });

  describe('getCampaign', () => {
    it('should fetch campaign successfully with ad account data', async () => {
      const mockCampaign: Campaign = {
        id: 1,
        ad_campaign_id: 'google-campaign-456',
        name: 'Test Campaign',
        active: true,
        platform: 'google',
        ad_account_id: 10,
        budget: 1000,
        ad_accounts: {
          ad_account_id: 'google-account-789',
          account_id: 123,
          accounts: {
            user_id: 'user-abc',
          },
        },
      };

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockCampaign, error: null }),
      };

      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await AdService.getCampaign('campaign-123');

      expect(result).toEqual(mockCampaign);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('ad_campaigns');
      expect(mockChain.eq).toHaveBeenCalledWith('id', 'campaign-123');
    });

    it('should return null when campaign not found', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi
          .fn()
          .mockResolvedValue({
            data: null,
            error: { message: 'Campaign not found', code: 'PGRST116' },
          }),
      };

      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await AdService.getCampaign('invalid-id');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error fetching campaign:', expect.any(Object));
    });

    it('should return null and log error when Supabase query fails', async () => {
      const dbError = { message: 'Database connection error', code: 'PGRST301' };
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      };

      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await AdService.getCampaign('campaign-123');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error fetching campaign:', dbError);
    });
  });

  describe('updateCampaignStatus', () => {
    const mockCampaign: Campaign = {
      id: 1,
      ad_campaign_id: 'google-campaign-456',
      name: 'Test Campaign',
      active: false,
      platform: 'google',
      ad_account_id: 10,
      ad_accounts: {
        ad_account_id: 'google-account-789',
        account_id: 123,
        accounts: {
          user_id: 'user-abc',
        },
      },
    };

    it('should update Google Ads campaign status to enabled', async () => {
      // Mock getCampaign call
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockCampaign, error: null }),
      };

      // Mock database update
      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain) // First call for getCampaign
        .mockReturnValueOnce(mockUpdateChain); // Second call for update

      vi.mocked(updateGoogleCampaignStatus).mockResolvedValue(undefined);

      const result = await AdService.updateCampaignStatus('google', '1', true);

      expect(updateGoogleCampaignStatus).toHaveBeenCalledWith(
        'google-account-789',
        123,
        'google-campaign-456',
        true
      );
      expect(mockUpdateChain.update).toHaveBeenCalledWith({ active: true });
      expect(result.active).toBe(true);
      expect(result.id).toBe(1);
    });

    it('should update Google Ads campaign status to disabled', async () => {
      const enabledCampaign = { ...mockCampaign, active: true };

      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: enabledCampaign, error: null }),
      };

      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateGoogleCampaignStatus).mockResolvedValue(undefined);

      const result = await AdService.updateCampaignStatus('google', '1', false);

      expect(updateGoogleCampaignStatus).toHaveBeenCalledWith(
        'google-account-789',
        123,
        'google-campaign-456',
        false
      );
      expect(result.active).toBe(false);
    });

    it('should update Meta Ads campaign status to enabled', async () => {
      const metaCampaign: Campaign = {
        ...mockCampaign,
        platform: 'facebook',
        ad_campaign_id: 'meta-campaign-456',
        ad_accounts: {
          ad_account_id: 'act_999',
          account_id: 123,
          accounts: {
            user_id: 'user-abc',
          },
        },
      };

      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: metaCampaign, error: null }),
      };

      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateMetaCampaignStatus).mockResolvedValue(undefined);

      const result = await AdService.updateCampaignStatus('facebook', '1', true);

      expect(updateMetaCampaignStatus).toHaveBeenCalledWith(123, 'meta-campaign-456', true);
      expect(result.active).toBe(true);
    });

    it('should update Meta Ads campaign status to disabled', async () => {
      const metaCampaign: Campaign = {
        ...mockCampaign,
        platform: 'facebook',
        ad_campaign_id: 'meta-campaign-456',
        active: true,
        ad_accounts: {
          ad_account_id: 'act_999',
          account_id: 123,
          accounts: {
            user_id: 'user-abc',
          },
        },
      };

      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: metaCampaign, error: null }),
      };

      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateMetaCampaignStatus).mockResolvedValue(undefined);

      const result = await AdService.updateCampaignStatus('facebook', '1', false);

      expect(updateMetaCampaignStatus).toHaveBeenCalledWith(123, 'meta-campaign-456', false);
      expect(result.active).toBe(false);
    });

    it('should throw error when campaign not found', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockGetChain);

      await expect(AdService.updateCampaignStatus('google', 'invalid-id', true)).rejects.toThrow(
        'Campaign not found'
      );

      expect(updateGoogleCampaignStatus).not.toHaveBeenCalled();
    });

    it('should throw error for unsupported provider', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockCampaign, error: null }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockGetChain);

      await expect(
        AdService.updateCampaignStatus('tiktok' as AdProvider, '1', true)
      ).rejects.toThrow('Unsupported provider: tiktok');

      expect(updateGoogleCampaignStatus).not.toHaveBeenCalled();
      expect(updateMetaCampaignStatus).not.toHaveBeenCalled();
    });

    it('should throw error when database update fails', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockCampaign, error: null }),
      };

      const dbError = { message: 'Database update failed', code: 'PGRST301' };
      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateGoogleCampaignStatus).mockResolvedValue(undefined);

      await expect(AdService.updateCampaignStatus('google', '1', true)).rejects.toThrow(
        'Failed to update campaign status in database'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error updating campaign status in database:',
        dbError
      );
    });
  });

  describe('updateCampaignBudget', () => {
    const mockCampaign: Campaign = {
      id: 1,
      ad_campaign_id: 'google-campaign-456',
      name: 'Test Campaign',
      active: true,
      platform: 'google',
      ad_account_id: 10,
      budget: 1000,
      ad_accounts: {
        ad_account_id: 'google-account-789',
        account_id: 123,
        accounts: {
          user_id: 'user-abc',
        },
      },
    };

    it('should update Google Ads campaign budget successfully', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockCampaign, error: null }),
      };

      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateGoogleCampaignBudget).mockResolvedValue(undefined);

      const result = await AdService.updateCampaignBudget('google', '1', 2000);

      expect(updateGoogleCampaignBudget).toHaveBeenCalledWith(
        'google-account-789',
        123,
        'google-campaign-456',
        2000
      );
      expect(mockUpdateChain.update).toHaveBeenCalledWith({ budget: 2000 });
      expect(result.budget).toBe(2000);
    });

    it('should update Meta Ads campaign budget successfully', async () => {
      const metaCampaign: Campaign = {
        ...mockCampaign,
        platform: 'facebook',
        ad_campaign_id: 'meta-campaign-456',
        ad_accounts: {
          ad_account_id: 'act_999',
          account_id: 123,
          accounts: {
            user_id: 'user-abc',
          },
        },
      };

      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: metaCampaign, error: null }),
      };

      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateMetaCampaignBudget).mockResolvedValue(undefined);

      const result = await AdService.updateCampaignBudget('facebook', '1', 1500);

      expect(updateMetaCampaignBudget).toHaveBeenCalledWith(123, 'meta-campaign-456', 1500);
      expect(result.budget).toBe(1500);
    });

    it('should throw error when campaign not found', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockGetChain);

      await expect(AdService.updateCampaignBudget('google', 'invalid-id', 2000)).rejects.toThrow(
        'Campaign not found'
      );
    });

    it('should throw error for unsupported provider', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockCampaign, error: null }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockGetChain);

      await expect(
        AdService.updateCampaignBudget('tiktok' as AdProvider, '1', 2000)
      ).rejects.toThrow('Unsupported provider: tiktok');
    });

    it('should throw error when database update fails', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockCampaign, error: null }),
      };

      const dbError = { message: 'Database update failed' };
      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateGoogleCampaignBudget).mockResolvedValue(undefined);

      await expect(AdService.updateCampaignBudget('google', '1', 2000)).rejects.toThrow(
        'Failed to update campaign budget in database'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error updating campaign budget in database:',
        dbError
      );
    });

    it('should handle budget value of zero', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockCampaign, error: null }),
      };

      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateGoogleCampaignBudget).mockResolvedValue(undefined);

      const result = await AdService.updateCampaignBudget('google', '1', 0);

      expect(updateGoogleCampaignBudget).toHaveBeenCalledWith(
        'google-account-789',
        123,
        'google-campaign-456',
        0
      );
      expect(result.budget).toBe(0);
    });
  });

  describe('getAdSet', () => {
    it('should fetch ad set successfully with nested data', async () => {
      const mockAdSet: AdSet = {
        id: 10,
        ad_set_id: 'adset-123',
        name: 'Test Ad Set',
        active: true,
        ad_campaign_id: 1,
        platform: 'facebook',
        budget: 500,
        ad_campaigns: {
          ad_accounts: {
            ad_account_id: 'act_999',
            account_id: 123,
            accounts: {
              user_id: 'user-abc',
            },
          },
        },
      };

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockAdSet, error: null }),
      };

      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await AdService.getAdSet('adset-10');

      expect(result).toEqual(mockAdSet);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('ad_sets');
      expect(mockChain.eq).toHaveBeenCalledWith('id', 'adset-10');
    });

    it('should return null when ad set not found', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Ad set not found' } }),
      };

      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await AdService.getAdSet('invalid-id');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error fetching ad set:', expect.any(Object));
    });

    it('should return null and log error when Supabase query fails', async () => {
      const dbError = { message: 'Database error' };
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      };

      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await AdService.getAdSet('adset-10');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error fetching ad set:', dbError);
    });
  });

  describe('updateAdSetStatus', () => {
    const mockAdSet: AdSet = {
      id: 10,
      ad_set_id: 'google-adset-456',
      name: 'Test Ad Set',
      active: false,
      ad_campaign_id: 1,
      platform: 'google',
      ad_campaigns: {
        ad_accounts: {
          ad_account_id: 'google-account-789',
          account_id: 123,
          accounts: {
            user_id: 'user-abc',
          },
        },
      },
    };

    it('should update Google Ads ad set status to enabled', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockAdSet, error: null }),
      };

      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateGoogleAdSetStatus).mockResolvedValue(undefined);

      const result = await AdService.updateAdSetStatus('google', '10', true);

      expect(updateGoogleAdSetStatus).toHaveBeenCalledWith(
        'google-account-789',
        123,
        'google-adset-456',
        true
      );
      expect(mockUpdateChain.update).toHaveBeenCalledWith({ active: true });
      expect(result.active).toBe(true);
    });

    it('should update Google Ads ad set status to disabled', async () => {
      const enabledAdSet = { ...mockAdSet, active: true };

      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: enabledAdSet, error: null }),
      };

      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateGoogleAdSetStatus).mockResolvedValue(undefined);

      const result = await AdService.updateAdSetStatus('google', '10', false);

      expect(updateGoogleAdSetStatus).toHaveBeenCalledWith(
        'google-account-789',
        123,
        'google-adset-456',
        false
      );
      expect(result.active).toBe(false);
    });

    it('should update Meta Ads ad set status to enabled', async () => {
      const metaAdSet: AdSet = {
        ...mockAdSet,
        platform: 'facebook',
        ad_set_id: 'meta-adset-456',
        ad_campaigns: {
          ad_accounts: {
            ad_account_id: 'act_999',
            account_id: 123,
            accounts: {
              user_id: 'user-abc',
            },
          },
        },
      };

      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: metaAdSet, error: null }),
      };

      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateMetaAdSetStatus).mockResolvedValue(undefined);

      const result = await AdService.updateAdSetStatus('facebook', '10', true);

      expect(updateMetaAdSetStatus).toHaveBeenCalledWith(123, 'meta-adset-456', true);
      expect(result.active).toBe(true);
    });

    it('should update Meta Ads ad set status to disabled', async () => {
      const metaAdSet: AdSet = {
        ...mockAdSet,
        platform: 'facebook',
        ad_set_id: 'meta-adset-456',
        active: true,
        ad_campaigns: {
          ad_accounts: {
            ad_account_id: 'act_999',
            account_id: 123,
            accounts: {
              user_id: 'user-abc',
            },
          },
        },
      };

      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: metaAdSet, error: null }),
      };

      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateMetaAdSetStatus).mockResolvedValue(undefined);

      const result = await AdService.updateAdSetStatus('facebook', '10', false);

      expect(updateMetaAdSetStatus).toHaveBeenCalledWith(123, 'meta-adset-456', false);
      expect(result.active).toBe(false);
    });

    it('should throw error when ad set not found', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockGetChain);

      await expect(AdService.updateAdSetStatus('google', 'invalid-id', true)).rejects.toThrow(
        'Ad set not found'
      );
    });

    it('should throw error for unsupported provider', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockAdSet, error: null }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockGetChain);

      await expect(
        AdService.updateAdSetStatus('tiktok' as AdProvider, '10', true)
      ).rejects.toThrow('Unsupported provider: tiktok');
    });

    it('should throw error when database update fails', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockAdSet, error: null }),
      };

      const dbError = { message: 'Update failed' };
      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateGoogleAdSetStatus).mockResolvedValue(undefined);

      await expect(AdService.updateAdSetStatus('google', '10', true)).rejects.toThrow(
        'Failed to update ad set status in database'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error updating ad set status in database:',
        dbError
      );
    });
  });

  describe('updateAdSetBudget', () => {
    const mockAdSet: AdSet = {
      id: 10,
      ad_set_id: 'meta-adset-456',
      name: 'Test Ad Set',
      active: true,
      ad_campaign_id: 1,
      platform: 'facebook',
      budget: 500,
      ad_campaigns: {
        ad_accounts: {
          ad_account_id: 'act_999',
          account_id: 123,
          accounts: {
            user_id: 'user-abc',
          },
        },
      },
    };

    it('should update Meta Ads ad set budget successfully', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockAdSet, error: null }),
      };

      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateMetaAdSetBudget).mockResolvedValue(undefined);

      const result = await AdService.updateAdSetBudget('facebook', '10', 750);

      expect(updateMetaAdSetBudget).toHaveBeenCalledWith(123, 'meta-adset-456', 750);
      expect(mockUpdateChain.update).toHaveBeenCalledWith({ budget: 750 });
      expect(result.budget).toBe(750);
    });

    it('should throw error when ad set not found', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockGetChain);

      await expect(AdService.updateAdSetBudget('facebook', 'invalid-id', 750)).rejects.toThrow(
        'Ad set not found'
      );
    });

    it('should throw error for Google Ads (not supported)', async () => {
      const googleAdSet: AdSet = {
        ...mockAdSet,
        platform: 'google',
        ad_set_id: 'google-adset-456',
        ad_campaigns: {
          ad_accounts: {
            ad_account_id: 'google-account-789',
            account_id: 123,
            accounts: {
              user_id: 'user-abc',
            },
          },
        },
      };

      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: googleAdSet, error: null }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockGetChain);

      await expect(AdService.updateAdSetBudget('google', '10', 750)).rejects.toThrow(
        'Google Ad Set budget update is not supported directly'
      );

      expect(updateMetaAdSetBudget).not.toHaveBeenCalled();
    });

    it('should throw error for unsupported provider', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockAdSet, error: null }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockGetChain);

      await expect(
        AdService.updateAdSetBudget('tiktok' as AdProvider, '10', 750)
      ).rejects.toThrow('Unsupported provider: tiktok');
    });

    it('should throw error when database update fails', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockAdSet, error: null }),
      };

      const dbError = { message: 'Update failed' };
      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateMetaAdSetBudget).mockResolvedValue(undefined);

      await expect(AdService.updateAdSetBudget('facebook', '10', 750)).rejects.toThrow(
        'Failed to update ad set budget in database'
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error updating ad set budget in database:',
        dbError
      );
    });
  });

  describe('getAd', () => {
    it('should fetch ad successfully with nested data', async () => {
      const mockAd: Ad = {
        id: 100,
        ad_id: 'ad-123',
        platform: 'facebook',
        name: 'Test Ad',
        active: true,
        ad_set_id: 10,
        ad_sets: {
          ad_set_id: 'adset-123',
          ad_campaigns: {
            ad_accounts: {
              ad_account_id: 'act_999',
              account_id: 123,
              accounts: {
                user_id: 'user-abc',
              },
            },
          },
        },
      };

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockAd, error: null }),
      };

      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await AdService.getAd('ad-100');

      expect(result).toEqual(mockAd);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('ads');
      expect(mockChain.eq).toHaveBeenCalledWith('id', 'ad-100');
    });

    it('should return null when ad not found', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Ad not found' } }),
      };

      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await AdService.getAd('invalid-id');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error fetching ad:', expect.any(Object));
    });

    it('should return null and log error when Supabase query fails', async () => {
      const dbError = { message: 'Database error' };
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      };

      mockSupabaseClient.from.mockReturnValue(mockChain);

      const result = await AdService.getAd('ad-100');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Error fetching ad:', dbError);
    });
  });

  describe('updateAdStatus', () => {
    const mockAd: Ad = {
      id: 100,
      ad_id: 'google-ad-456',
      platform: 'google',
      name: 'Test Ad',
      active: false,
      ad_set_id: 10,
      ad_sets: {
        ad_set_id: 'google-adset-123',
        ad_campaigns: {
          ad_accounts: {
            ad_account_id: 'google-account-789',
            account_id: 123,
            accounts: {
              user_id: 'user-abc',
            },
          },
        },
      },
    };

    it('should update Google Ads ad status to enabled', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockAd, error: null }),
      };

      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateGoogleAdStatus).mockResolvedValue(undefined);

      const result = await AdService.updateAdStatus('google', '100', true);

      expect(updateGoogleAdStatus).toHaveBeenCalledWith(
        'google-account-789',
        123,
        'google-adset-123',
        'google-ad-456',
        true
      );
      expect(mockUpdateChain.update).toHaveBeenCalledWith({ active: true });
      expect(result.active).toBe(true);
    });

    it('should update Google Ads ad status to disabled', async () => {
      const enabledAd = { ...mockAd, active: true };

      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: enabledAd, error: null }),
      };

      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateGoogleAdStatus).mockResolvedValue(undefined);

      const result = await AdService.updateAdStatus('google', '100', false);

      expect(updateGoogleAdStatus).toHaveBeenCalledWith(
        'google-account-789',
        123,
        'google-adset-123',
        'google-ad-456',
        false
      );
      expect(result.active).toBe(false);
    });

    it('should update Meta Ads ad status to enabled', async () => {
      const metaAd: Ad = {
        ...mockAd,
        platform: 'facebook',
        ad_id: 'meta-ad-456',
        ad_sets: {
          ad_set_id: 'meta-adset-123',
          ad_campaigns: {
            ad_accounts: {
              ad_account_id: 'act_999',
              account_id: 123,
              accounts: {
                user_id: 'user-abc',
              },
            },
          },
        },
      };

      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: metaAd, error: null }),
      };

      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateMetaAdStatus).mockResolvedValue(undefined);

      const result = await AdService.updateAdStatus('facebook', '100', true);

      expect(updateMetaAdStatus).toHaveBeenCalledWith(123, 'meta-ad-456', true);
      expect(result.active).toBe(true);
    });

    it('should update Meta Ads ad status to disabled', async () => {
      const metaAd: Ad = {
        ...mockAd,
        platform: 'facebook',
        ad_id: 'meta-ad-456',
        active: true,
        ad_sets: {
          ad_set_id: 'meta-adset-123',
          ad_campaigns: {
            ad_accounts: {
              ad_account_id: 'act_999',
              account_id: 123,
              accounts: {
                user_id: 'user-abc',
              },
            },
          },
        },
      };

      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: metaAd, error: null }),
      };

      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateMetaAdStatus).mockResolvedValue(undefined);

      const result = await AdService.updateAdStatus('facebook', '100', false);

      expect(updateMetaAdStatus).toHaveBeenCalledWith(123, 'meta-ad-456', false);
      expect(result.active).toBe(false);
    });

    it('should throw error when ad not found', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockGetChain);

      await expect(AdService.updateAdStatus('google', 'invalid-id', true)).rejects.toThrow(
        'Ad not found'
      );
    });

    it('should throw error for unsupported provider', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockAd, error: null }),
      };

      mockSupabaseClient.from.mockReturnValueOnce(mockGetChain);

      await expect(AdService.updateAdStatus('tiktok' as AdProvider, '100', true)).rejects.toThrow(
        'Unsupported provider: tiktok'
      );
    });

    it('should throw error when database update fails', async () => {
      const mockGetChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockAd, error: null }),
      };

      const dbError = { message: 'Update failed' };
      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: dbError }),
      };

      mockSupabaseClient.from
        .mockReturnValueOnce(mockGetChain)
        .mockReturnValueOnce(mockUpdateChain);

      vi.mocked(updateGoogleAdStatus).mockResolvedValue(undefined);

      await expect(AdService.updateAdStatus('google', '100', true)).rejects.toThrow(
        'Failed to update ad status in database'
      );

      expect(logger.error).toHaveBeenCalledWith('Error updating ad status in database:', dbError);
    });
  });

  describe('updateAdBudget', () => {
    it('should always throw error (ad budgets not supported)', async () => {
      await expect(AdService.updateAdBudget('facebook', '100', 500)).rejects.toThrow(
        'Ad budget updates are not supported. Budget is managed at the ad set or campaign level.'
      );

      await expect(AdService.updateAdBudget('google', '100', 500)).rejects.toThrow(
        'Ad budget updates are not supported. Budget is managed at the ad set or campaign level.'
      );

      // Verify no platform functions are called
      expect(updateMetaAdStatus).not.toHaveBeenCalled();
      expect(updateGoogleAdStatus).not.toHaveBeenCalled();
    });
  });
});
