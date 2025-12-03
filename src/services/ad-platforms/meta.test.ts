/**
 * Unit tests for Meta/Facebook Ads Platform Integration
 *
 * Testing strategy:
 * - Mock Facebook SDK (facebook-nodejs-business-sdk)
 * - Mock integration data service
 * - Mock logger
 * - Test all CRUD operations for campaigns, ad sets, and ads
 * - Test budget conversion (dollars to cents: budget * 100)
 * - Test status conversion (enabled → 'ACTIVE', disabled → 'PAUSED')
 * - Test permission error detection and handling
 * - Test integration validation (missing tokens)
 * - Test simulation mode (SIMULATE_FB_PERMISSION_ERROR)
 * - Test error handling for various Facebook API errors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies before imports
vi.mock('facebook-nodejs-business-sdk', () => ({
  FacebookAdsApi: { init: vi.fn() },
  Campaign: vi.fn(),
  AdSet: vi.fn(),
  Ad: vi.fn(),
}));

vi.mock('@/services/integrations.js', () => ({
  getIntegrationData: vi.fn(),
}));

vi.mock('@/config/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/config/environment.js', () => ({
  env: {
    SIMULATE_FB_PERMISSION_ERROR: false,
  },
}));

// Import after mocks
import {
  updateMetaCampaignStatus,
  updateMetaCampaignBudget,
  updateMetaAdSetStatus,
  updateMetaAdSetBudget,
  updateMetaAdStatus,
} from './meta.js';
import { FacebookPermissionError } from '@/middleware/error.js';
import { getIntegrationData } from '@/services/integrations.js';
import { FacebookAdsApi, Campaign, AdSet, Ad } from 'facebook-nodejs-business-sdk';
import { env } from '@/config/environment.js';

describe('Meta/Facebook Ads Platform Integration', () => {
  let mockCampaignUpdate: ReturnType<typeof vi.fn>;
  let mockAdSetUpdate: ReturnType<typeof vi.fn>;
  let mockAdUpdate: ReturnType<typeof vi.fn>;

  const mockIntegration = {
    id: 1,
    account_id: 123,
    provider: 'meta-ads',
    access_token: 'mock-facebook-access-token',
    refresh_token: 'mock-refresh-token',
  };

  const mockApiInstance = {
    accessToken: 'mock-facebook-access-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset simulation flag
    (env as any).SIMULATE_FB_PERMISSION_ERROR = false;

    // Create fresh mock functions
    mockCampaignUpdate = vi.fn().mockResolvedValue({});
    mockAdSetUpdate = vi.fn().mockResolvedValue({});
    mockAdUpdate = vi.fn().mockResolvedValue({});

    // Setup integration mock
    vi.mocked(getIntegrationData).mockResolvedValue(mockIntegration as any);

    // Setup Facebook API mock
    vi.mocked(FacebookAdsApi.init).mockReturnValue(mockApiInstance as any);

    // Setup SDK class mocks
    vi.mocked(Campaign).mockImplementation(((_id: string, _options: any) => ({
      update: mockCampaignUpdate,
    })) as any);

    vi.mocked(AdSet).mockImplementation(((_id: string, _options: any) => ({
      update: mockAdSetUpdate,
    })) as any);

    vi.mocked(Ad).mockImplementation(((_id: string, _options: any) => ({
      update: mockAdUpdate,
    })) as any);
  });

  afterEach(() => {
    (env as any).SIMULATE_FB_PERMISSION_ERROR = false;
  });

  describe('updateMetaCampaignStatus', () => {
    const accountId = 123;
    const campaignId = 'fb-campaign-123';

    it('should update campaign status to ACTIVE when enabled is true', async () => {
      await updateMetaCampaignStatus(accountId, campaignId, true);

      expect(getIntegrationData).toHaveBeenCalledWith('meta-ads', accountId);
      expect(FacebookAdsApi.init).toHaveBeenCalledWith(mockIntegration.access_token);
      expect(mockCampaignUpdate).toHaveBeenCalledWith([], { status: 'ACTIVE' });
    });

    it('should update campaign status to PAUSED when enabled is false', async () => {
      await updateMetaCampaignStatus(accountId, campaignId, false);

      expect(mockCampaignUpdate).toHaveBeenCalledWith([], { status: 'PAUSED' });
    });

    it('should throw error when integration is not found', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue(null);

      await expect(updateMetaCampaignStatus(accountId, campaignId, true)).rejects.toThrow(
        'Meta Ads integration not found'
      );
    });

    it('should throw error when access token is missing', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue({
        ...mockIntegration,
        access_token: null,
      } as any);

      await expect(updateMetaCampaignStatus(accountId, campaignId, true)).rejects.toThrow(
        'Meta Ads access token not found'
      );
    });

    it('should throw FacebookPermissionError for permission errors (code 100)', async () => {
      mockCampaignUpdate.mockRejectedValue({
        response: {
          error: {
            code: 100,
            message: 'Object does not exist, cannot be loaded due to missing permissions',
          },
        },
      });

      await expect(updateMetaCampaignStatus(accountId, campaignId, true)).rejects.toThrow(
        FacebookPermissionError
      );
    });

    it('should detect permission error with "missing permissions" message', async () => {
      mockCampaignUpdate.mockRejectedValue({
        response: {
          error: {
            code: 100,
            message: 'User missing permissions to access this resource',
          },
        },
      });

      await expect(updateMetaCampaignStatus(accountId, campaignId, true)).rejects.toThrow(
        FacebookPermissionError
      );
    });

    it('should throw regular Error for non-permission Facebook API errors', async () => {
      mockCampaignUpdate.mockRejectedValue({
        response: {
          error: {
            code: 190,
            message: 'Invalid OAuth 2.0 Access Token',
            error_user_title: 'Authentication Error',
            error_subcode: 463,
          },
        },
      });

      await expect(updateMetaCampaignStatus(accountId, campaignId, true)).rejects.toThrow(
        'Authentication Error: Invalid OAuth 2.0 Access Token (Code: 190, Subcode: 463)'
      );
    });

    it('should handle errors without response.error structure', async () => {
      mockCampaignUpdate.mockRejectedValue(new Error('Network request failed'));

      await expect(updateMetaCampaignStatus(accountId, campaignId, true)).rejects.toThrow(
        'Failed to update campaign status on Facebook: Network request failed'
      );
    });

    it('should throw simulated permission error when SIMULATE_FB_PERMISSION_ERROR is true', async () => {
      (env as any).SIMULATE_FB_PERMISSION_ERROR = true;

      await expect(updateMetaCampaignStatus(accountId, campaignId, true)).rejects.toThrow(
        FacebookPermissionError
      );

      // Verify that the actual API call was never made
      expect(mockCampaignUpdate).not.toHaveBeenCalled();
    });
  });

  describe('updateMetaCampaignBudget', () => {
    const accountId = 123;
    const campaignId = 'fb-campaign-123';

    it('should update campaign budget with correct cent conversion', async () => {
      const budgetInDollars = 100;

      await updateMetaCampaignBudget(accountId, campaignId, budgetInDollars);

      expect(mockCampaignUpdate).toHaveBeenCalledWith([], {
        daily_budget: 10000, // 100 * 100 = 10000 cents
      });
    });

    it('should handle decimal budget values', async () => {
      const budgetInDollars = 50.5;

      await updateMetaCampaignBudget(accountId, campaignId, budgetInDollars);

      expect(mockCampaignUpdate).toHaveBeenCalledWith([], {
        daily_budget: 5050, // 50.5 * 100 = 5050 cents
      });
    });

    it('should handle small budget values', async () => {
      const budgetInDollars = 1.25;

      await updateMetaCampaignBudget(accountId, campaignId, budgetInDollars);

      expect(mockCampaignUpdate).toHaveBeenCalledWith([], {
        daily_budget: 125, // 1.25 * 100 = 125 cents
      });
    });

    it('should handle zero budget', async () => {
      const budgetInDollars = 0;

      await updateMetaCampaignBudget(accountId, campaignId, budgetInDollars);

      expect(mockCampaignUpdate).toHaveBeenCalledWith([], {
        daily_budget: 0,
      });
    });

    it('should throw error when integration is not found', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue(null);

      await expect(updateMetaCampaignBudget(accountId, campaignId, 100)).rejects.toThrow(
        'Meta Ads integration not found'
      );
    });

    it('should throw FacebookPermissionError for permission errors', async () => {
      mockCampaignUpdate.mockRejectedValue({
        response: {
          error: {
            code: 100,
            message: 'cannot be loaded due to missing permissions',
          },
        },
      });

      await expect(updateMetaCampaignBudget(accountId, campaignId, 100)).rejects.toThrow(
        FacebookPermissionError
      );
    });

    it('should throw simulated permission error when SIMULATE_FB_PERMISSION_ERROR is true', async () => {
      (env as any).SIMULATE_FB_PERMISSION_ERROR = true;

      await expect(updateMetaCampaignBudget(accountId, campaignId, 100)).rejects.toThrow(
        FacebookPermissionError
      );
    });
  });

  describe('updateMetaAdSetStatus', () => {
    const accountId = 123;
    const adSetId = 'fb-adset-456';

    it('should update ad set status to ACTIVE when enabled is true', async () => {
      await updateMetaAdSetStatus(accountId, adSetId, true);

      expect(mockAdSetUpdate).toHaveBeenCalledWith([], { status: 'ACTIVE' });
    });

    it('should update ad set status to PAUSED when enabled is false', async () => {
      await updateMetaAdSetStatus(accountId, adSetId, false);

      expect(mockAdSetUpdate).toHaveBeenCalledWith([], { status: 'PAUSED' });
    });

    it('should throw error when integration is not found', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue(null);

      await expect(updateMetaAdSetStatus(accountId, adSetId, true)).rejects.toThrow(
        'Meta Ads integration not found'
      );
    });

    it('should throw FacebookPermissionError for permission errors', async () => {
      mockAdSetUpdate.mockRejectedValue({
        response: {
          error: {
            code: 100,
            message: 'missing permissions',
          },
        },
      });

      await expect(updateMetaAdSetStatus(accountId, adSetId, true)).rejects.toThrow(
        FacebookPermissionError
      );
    });

    it('should throw simulated permission error when SIMULATE_FB_PERMISSION_ERROR is true', async () => {
      (env as any).SIMULATE_FB_PERMISSION_ERROR = true;

      await expect(updateMetaAdSetStatus(accountId, adSetId, true)).rejects.toThrow(
        FacebookPermissionError
      );
    });
  });

  describe('updateMetaAdSetBudget', () => {
    const accountId = 123;
    const adSetId = 'fb-adset-456';

    it('should update ad set budget with correct cent conversion', async () => {
      const budgetInDollars = 75;

      await updateMetaAdSetBudget(accountId, adSetId, budgetInDollars);

      expect(mockAdSetUpdate).toHaveBeenCalledWith([], {
        daily_budget: 7500, // 75 * 100 = 7500 cents
      });
    });

    it('should handle decimal budget values', async () => {
      const budgetInDollars = 99.99;

      await updateMetaAdSetBudget(accountId, adSetId, budgetInDollars);

      expect(mockAdSetUpdate).toHaveBeenCalledWith([], {
        daily_budget: 9999, // 99.99 * 100 = 9999 cents
      });
    });

    it('should throw error when integration is not found', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue(null);

      await expect(updateMetaAdSetBudget(accountId, adSetId, 100)).rejects.toThrow(
        'Meta Ads integration not found'
      );
    });

    it('should throw FacebookPermissionError for permission errors', async () => {
      mockAdSetUpdate.mockRejectedValue({
        response: {
          error: {
            code: 100,
            message: 'cannot be loaded due to missing permissions',
          },
        },
      });

      await expect(updateMetaAdSetBudget(accountId, adSetId, 100)).rejects.toThrow(
        FacebookPermissionError
      );
    });
  });

  describe('updateMetaAdStatus', () => {
    const accountId = 123;
    const adId = 'fb-ad-789';

    it('should update ad status to ACTIVE when enabled is true', async () => {
      await updateMetaAdStatus(accountId, adId, true);

      expect(mockAdUpdate).toHaveBeenCalledWith([], { status: 'ACTIVE' });
    });

    it('should update ad status to PAUSED when enabled is false', async () => {
      await updateMetaAdStatus(accountId, adId, false);

      expect(mockAdUpdate).toHaveBeenCalledWith([], { status: 'PAUSED' });
    });

    it('should throw error when integration is not found', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue(null);

      await expect(updateMetaAdStatus(accountId, adId, true)).rejects.toThrow(
        'Meta Ads integration not found'
      );
    });

    it('should throw error when access token is missing', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue({
        ...mockIntegration,
        access_token: '',
      } as any);

      await expect(updateMetaAdStatus(accountId, adId, true)).rejects.toThrow(
        'Meta Ads access token not found'
      );
    });

    it('should throw FacebookPermissionError for permission errors', async () => {
      mockAdUpdate.mockRejectedValue({
        response: {
          error: {
            code: 100,
            message: 'missing permissions',
          },
        },
      });

      await expect(updateMetaAdStatus(accountId, adId, true)).rejects.toThrow(
        FacebookPermissionError
      );
    });

    it('should throw regular Error for non-permission Facebook API errors', async () => {
      mockAdUpdate.mockRejectedValue({
        response: {
          error: {
            code: 2500,
            message: 'Ad set was deleted',
            error_user_title: 'Invalid Request',
          },
        },
      });

      await expect(updateMetaAdStatus(accountId, adId, true)).rejects.toThrow(
        'Invalid Request: Ad set was deleted (Code: 2500'
      );
    });

    it('should throw simulated permission error when SIMULATE_FB_PERMISSION_ERROR is true', async () => {
      (env as any).SIMULATE_FB_PERMISSION_ERROR = true;

      await expect(updateMetaAdStatus(accountId, adId, true)).rejects.toThrow(
        FacebookPermissionError
      );
    });
  });

  describe('Integration Validation', () => {
    it('should validate integration data for all update functions', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue(null);

      await expect(updateMetaCampaignStatus(123, 'campaign-1', true)).rejects.toThrow(
        'Meta Ads integration not found'
      );
      await expect(updateMetaCampaignBudget(123, 'campaign-1', 100)).rejects.toThrow(
        'Meta Ads integration not found'
      );
      await expect(updateMetaAdSetStatus(123, 'adset-1', true)).rejects.toThrow(
        'Meta Ads integration not found'
      );
      await expect(updateMetaAdSetBudget(123, 'adset-1', 100)).rejects.toThrow(
        'Meta Ads integration not found'
      );
      await expect(updateMetaAdStatus(123, 'ad-1', true)).rejects.toThrow(
        'Meta Ads integration not found'
      );
    });

    it('should validate access token for all update functions', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue({
        ...mockIntegration,
        access_token: null,
      } as any);

      await expect(updateMetaCampaignStatus(123, 'campaign-1', true)).rejects.toThrow(
        'Meta Ads access token not found'
      );
      await expect(updateMetaCampaignBudget(123, 'campaign-1', 100)).rejects.toThrow(
        'Meta Ads access token not found'
      );
      await expect(updateMetaAdSetStatus(123, 'adset-1', true)).rejects.toThrow(
        'Meta Ads access token not found'
      );
      await expect(updateMetaAdSetBudget(123, 'adset-1', 100)).rejects.toThrow(
        'Meta Ads access token not found'
      );
      await expect(updateMetaAdStatus(123, 'ad-1', true)).rejects.toThrow(
        'Meta Ads access token not found'
      );
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('should handle Facebook errors with error_user_msg field', async () => {
      mockCampaignUpdate.mockRejectedValue({
        response: {
          error: {
            code: 2500,
            message: 'Technical error message',
            error_user_msg: 'User-friendly error message',
            error_user_title: 'Request Failed',
          },
        },
      });

      await expect(updateMetaCampaignStatus(123, 'campaign-1', true)).rejects.toThrow(
        'Request Failed: User-friendly error message'
      );
    });

    it('should handle Facebook errors without error_user_title', async () => {
      mockCampaignUpdate.mockRejectedValue({
        response: {
          error: {
            code: 2500,
            message: 'Some error occurred',
          },
        },
      });

      await expect(updateMetaCampaignStatus(123, 'campaign-1', true)).rejects.toThrow(
        'Facebook API Error: Some error occurred (Code: 2500'
      );
    });

    it('should handle permission error that only includes "missing permissions" without other patterns', async () => {
      mockCampaignUpdate.mockRejectedValue({
        response: {
          error: {
            code: 100,
            message: 'User has missing permissions for this action',
          },
        },
      });

      await expect(updateMetaCampaignStatus(123, 'campaign-1', true)).rejects.toThrow(
        FacebookPermissionError
      );
    });

    it('should NOT treat error code 100 as permission error if message does not match patterns', async () => {
      mockCampaignUpdate.mockRejectedValue({
        response: {
          error: {
            code: 100,
            message: 'Invalid parameter value',
          },
        },
      });

      await expect(updateMetaCampaignStatus(123, 'campaign-1', true)).rejects.toThrow(
        'Facebook API Error: Invalid parameter value (Code: 100'
      );
    });
  });
});
