/**
 * Unit tests for Google Ads Platform Integration
 *
 * Testing strategy:
 * - Mock Google Ads API (google-ads-api)
 * - Mock integration data service
 * - Mock logger
 * - Test all CRUD operations for campaigns, ad groups, and ads
 * - Test budget conversion (dollars to micros: budget * 1000000)
 * - Test status conversion (enabled → ENABLED, disabled → PAUSED)
 * - Test campaign ID validation (digits only)
 * - Test budget update flow (query campaign → get budget ID → update)
 * - Test ad resource name format (customers/{id}/adGroupAds/{adSetId}~{adId})
 * - Test integration validation (missing refresh tokens)
 * - Test error handling for various API errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Google Ads API
vi.mock('google-ads-api', () => ({
  GoogleAdsApi: vi.fn(),
  enums: {
    CampaignStatus: {
      ENABLED: 2,
      PAUSED: 3,
    },
    AdGroupStatus: {
      ENABLED: 2,
      PAUSED: 3,
    },
    AdGroupAdStatus: {
      ENABLED: 2,
      PAUSED: 3,
    },
  },
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
    GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_DEVELOPER_ACCOUNT: 'test-developer-token',
  },
}));

// Import after mocks
import {
  getGoogleCustomer,
  updateGoogleCampaignStatus,
  updateGoogleCampaignBudget,
  updateGoogleAdSetStatus,
  updateGoogleAdStatus,
} from './google.js';
import { getIntegrationData } from '@/services/integrations.js';
import { GoogleAdsApi } from 'google-ads-api';

describe('Google Ads Platform Integration', () => {
  let mockCustomer: any;
  let mockCampaignsUpdate: ReturnType<typeof vi.fn>;
  let mockCampaignBudgetsUpdate: ReturnType<typeof vi.fn>;
  let mockAdGroupsUpdate: ReturnType<typeof vi.fn>;
  let mockAdGroupAdsUpdate: ReturnType<typeof vi.fn>;
  let mockQuery: ReturnType<typeof vi.fn>;

  const mockIntegration = {
    id: 1,
    account_id: 123,
    provider: 'google-ads',
    refresh_token: 'mock-google-refresh-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock functions
    mockCampaignsUpdate = vi.fn().mockResolvedValue(undefined);
    mockCampaignBudgetsUpdate = vi.fn().mockResolvedValue(undefined);
    mockAdGroupsUpdate = vi.fn().mockResolvedValue(undefined);
    mockAdGroupAdsUpdate = vi.fn().mockResolvedValue(undefined);
    mockQuery = vi.fn();

    // Setup customer mock
    mockCustomer = {
      campaigns: {
        update: mockCampaignsUpdate,
      },
      campaignBudgets: {
        update: mockCampaignBudgetsUpdate,
      },
      adGroups: {
        update: mockAdGroupsUpdate,
      },
      adGroupAds: {
        update: mockAdGroupAdsUpdate,
      },
      query: mockQuery,
    };

    // Setup integration mock
    vi.mocked(getIntegrationData).mockResolvedValue(mockIntegration as any);

    // Setup Google Ads API mock
    const mockGoogleAdsApi = {
      Customer: vi.fn().mockReturnValue(mockCustomer),
    };
    vi.mocked(GoogleAdsApi).mockImplementation(() => mockGoogleAdsApi as any);
  });

  describe('getGoogleCustomer', () => {
    const adAccountId = '1234567890';
    const accountId = 123;

    it('should create Google Ads customer instance successfully', async () => {
      const customer = await getGoogleCustomer(adAccountId, accountId);

      expect(getIntegrationData).toHaveBeenCalledWith('google-ads', accountId);
      expect(GoogleAdsApi).toHaveBeenCalledWith({
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        developer_token: 'test-developer-token',
      });
      expect(customer).toBeDefined();
    });

    it('should throw error when integration is not found', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue(null);

      await expect(getGoogleCustomer(adAccountId, accountId)).rejects.toThrow(
        'Google Ads integration not found'
      );
    });

    it('should throw error when refresh token is missing', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue({
        ...mockIntegration,
        refresh_token: null,
      } as any);

      await expect(getGoogleCustomer(adAccountId, accountId)).rejects.toThrow(
        'Google Ads refresh token not found'
      );
    });

    it('should throw error when refresh token is empty string', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue({
        ...mockIntegration,
        refresh_token: '',
      } as any);

      await expect(getGoogleCustomer(adAccountId, accountId)).rejects.toThrow(
        'Google Ads refresh token not found'
      );
    });
  });

  describe('updateGoogleCampaignStatus', () => {
    const adAccountId = '1234567890';
    const accountId = 123;
    const campaignId = '9876543210';

    it('should update campaign status to ENABLED when enabled is true', async () => {
      await updateGoogleCampaignStatus(adAccountId, accountId, campaignId, true);

      expect(mockCampaignsUpdate).toHaveBeenCalledWith([
        {
          resource_name: `customers/${adAccountId}/campaigns/${campaignId}`,
          status: 2, // ENABLED
        },
      ]);
    });

    it('should update campaign status to PAUSED when enabled is false', async () => {
      await updateGoogleCampaignStatus(adAccountId, accountId, campaignId, false);

      expect(mockCampaignsUpdate).toHaveBeenCalledWith([
        {
          resource_name: `customers/${adAccountId}/campaigns/${campaignId}`,
          status: 3, // PAUSED
        },
      ]);
    });

    it('should throw error when integration is not found', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue(null);

      await expect(
        updateGoogleCampaignStatus(adAccountId, accountId, campaignId, true)
      ).rejects.toThrow('Google Ads integration not found');
    });

    it('should throw error when refresh token is missing', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue({
        ...mockIntegration,
        refresh_token: null,
      } as any);

      await expect(
        updateGoogleCampaignStatus(adAccountId, accountId, campaignId, true)
      ).rejects.toThrow('Google Ads refresh token not found');
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Google Ads API error');
      mockCampaignsUpdate.mockRejectedValue(apiError);

      await expect(
        updateGoogleCampaignStatus(adAccountId, accountId, campaignId, true)
      ).rejects.toThrow('Google Ads API error');
    });
  });

  describe('updateGoogleCampaignBudget', () => {
    const adAccountId = '1234567890';
    const accountId = 123;
    const campaignId = '9876543210';
    const budgetId = '1111111111';

    const mockCampaignQueryResult = [
      {
        campaign: {
          id: campaignId,
          name: 'Test Campaign',
        },
        campaign_budget: {
          id: budgetId,
          amount_micros: 50000000,
        },
      },
    ];

    beforeEach(() => {
      mockQuery.mockResolvedValue(mockCampaignQueryResult);
    });

    it('should update campaign budget with correct micros conversion', async () => {
      const budgetInDollars = 100;

      await updateGoogleCampaignBudget(adAccountId, accountId, campaignId, budgetInDollars);

      expect(mockQuery).toHaveBeenCalled();
      expect(mockCampaignBudgetsUpdate).toHaveBeenCalledWith([
        {
          resource_name: `customers/${adAccountId}/campaignBudgets/${budgetId}`,
          amount_micros: 100000000, // 100 * 1000000 = 100000000 micros
        },
      ]);
    });

    it('should handle decimal budget values', async () => {
      const budgetInDollars = 50.5;

      await updateGoogleCampaignBudget(adAccountId, accountId, campaignId, budgetInDollars);

      expect(mockCampaignBudgetsUpdate).toHaveBeenCalledWith([
        {
          resource_name: `customers/${adAccountId}/campaignBudgets/${budgetId}`,
          amount_micros: 50500000, // 50.5 * 1000000 = 50500000 micros
        },
      ]);
    });

    it('should handle small budget values', async () => {
      const budgetInDollars = 1.25;

      await updateGoogleCampaignBudget(adAccountId, accountId, campaignId, budgetInDollars);

      expect(mockCampaignBudgetsUpdate).toHaveBeenCalledWith([
        {
          resource_name: `customers/${adAccountId}/campaignBudgets/${budgetId}`,
          amount_micros: 1250000, // 1.25 * 1000000 = 1250000 micros
        },
      ]);
    });

    it('should handle zero budget', async () => {
      const budgetInDollars = 0;

      await updateGoogleCampaignBudget(adAccountId, accountId, campaignId, budgetInDollars);

      expect(mockCampaignBudgetsUpdate).toHaveBeenCalledWith([
        {
          resource_name: `customers/${adAccountId}/campaignBudgets/${budgetId}`,
          amount_micros: 0,
        },
      ]);
    });

    it('should throw error when campaign ID contains non-digits', async () => {
      const invalidCampaignId = 'campaign-123';

      await expect(
        updateGoogleCampaignBudget(adAccountId, accountId, invalidCampaignId, 100)
      ).rejects.toThrow('Invalid campaign ID: must contain only digits');
    });

    it('should throw error when campaign ID contains special characters', async () => {
      const invalidCampaignId = '123-456';

      await expect(
        updateGoogleCampaignBudget(adAccountId, accountId, invalidCampaignId, 100)
      ).rejects.toThrow('Invalid campaign ID: must contain only digits');
    });

    it('should throw error when campaign ID contains letters', async () => {
      const invalidCampaignId = '123abc';

      await expect(
        updateGoogleCampaignBudget(adAccountId, accountId, invalidCampaignId, 100)
      ).rejects.toThrow('Invalid campaign ID: must contain only digits');
    });

    it('should accept campaign ID with only digits', async () => {
      const validCampaignId = '987654321';

      await updateGoogleCampaignBudget(adAccountId, accountId, validCampaignId, 100);

      expect(mockQuery).toHaveBeenCalled();
      expect(mockCampaignBudgetsUpdate).toHaveBeenCalled();
    });

    it('should throw error when campaign is not found', async () => {
      mockQuery.mockResolvedValue([]);

      await expect(
        updateGoogleCampaignBudget(adAccountId, accountId, campaignId, 100)
      ).rejects.toThrow('Campaign not found in Google Ads');
    });

    it('should throw error when campaign query returns null', async () => {
      mockQuery.mockResolvedValue(null);

      await expect(
        updateGoogleCampaignBudget(adAccountId, accountId, campaignId, 100)
      ).rejects.toThrow('Campaign not found in Google Ads');
    });

    it('should throw error when campaign budget is not found', async () => {
      mockQuery.mockResolvedValue([
        {
          campaign: {
            id: campaignId,
            name: 'Test Campaign',
          },
          campaign_budget: null,
        },
      ]);

      await expect(
        updateGoogleCampaignBudget(adAccountId, accountId, campaignId, 100)
      ).rejects.toThrow('Campaign budget not found in Google Ads');
    });

    it('should throw error when campaign budget ID is missing', async () => {
      mockQuery.mockResolvedValue([
        {
          campaign: {
            id: campaignId,
            name: 'Test Campaign',
          },
          campaign_budget: {
            id: null,
            amount_micros: 50000000,
          },
        },
      ]);

      await expect(
        updateGoogleCampaignBudget(adAccountId, accountId, campaignId, 100)
      ).rejects.toThrow('Campaign budget not found in Google Ads');
    });

    it('should throw error when integration is not found', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue(null);

      await expect(
        updateGoogleCampaignBudget(adAccountId, accountId, campaignId, 100)
      ).rejects.toThrow('Google Ads integration not found');
    });
  });

  describe('updateGoogleAdSetStatus', () => {
    const adAccountId = '1234567890';
    const accountId = 123;
    const adSetId = '5555555555';

    it('should update ad group status to ENABLED when enabled is true', async () => {
      await updateGoogleAdSetStatus(adAccountId, accountId, adSetId, true);

      expect(mockAdGroupsUpdate).toHaveBeenCalledWith([
        {
          resource_name: `customers/${adAccountId}/adGroups/${adSetId}`,
          status: 2, // ENABLED
        },
      ]);
    });

    it('should update ad group status to PAUSED when enabled is false', async () => {
      await updateGoogleAdSetStatus(adAccountId, accountId, adSetId, false);

      expect(mockAdGroupsUpdate).toHaveBeenCalledWith([
        {
          resource_name: `customers/${adAccountId}/adGroups/${adSetId}`,
          status: 3, // PAUSED
        },
      ]);
    });

    it('should throw error when integration is not found', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue(null);

      await expect(updateGoogleAdSetStatus(adAccountId, accountId, adSetId, true)).rejects.toThrow(
        'Google Ads integration not found'
      );
    });

    it('should throw error when refresh token is missing', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue({
        ...mockIntegration,
        refresh_token: null,
      } as any);

      await expect(updateGoogleAdSetStatus(adAccountId, accountId, adSetId, true)).rejects.toThrow(
        'Google Ads refresh token not found'
      );
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Ad group not found');
      mockAdGroupsUpdate.mockRejectedValue(apiError);

      await expect(updateGoogleAdSetStatus(adAccountId, accountId, adSetId, true)).rejects.toThrow(
        'Ad group not found'
      );
    });
  });

  describe('updateGoogleAdStatus', () => {
    const adAccountId = '1234567890';
    const accountId = 123;
    const adSetId = '5555555555';
    const adId = '7777777777';

    it('should update ad status to ENABLED when enabled is true', async () => {
      await updateGoogleAdStatus(adAccountId, accountId, adSetId, adId, true);

      expect(mockAdGroupAdsUpdate).toHaveBeenCalledWith([
        {
          resource_name: `customers/${adAccountId}/adGroupAds/${adSetId}~${adId}`,
          status: 2, // ENABLED
        },
      ]);
    });

    it('should update ad status to PAUSED when enabled is false', async () => {
      await updateGoogleAdStatus(adAccountId, accountId, adSetId, adId, false);

      expect(mockAdGroupAdsUpdate).toHaveBeenCalledWith([
        {
          resource_name: `customers/${adAccountId}/adGroupAds/${adSetId}~${adId}`,
          status: 3, // PAUSED
        },
      ]);
    });

    it('should use correct resource name format with tilde separator', async () => {
      await updateGoogleAdStatus(adAccountId, accountId, adSetId, adId, true);

      const callArgs = mockAdGroupAdsUpdate.mock.calls[0][0];
      expect(callArgs[0].resource_name).toContain('~');
      expect(callArgs[0].resource_name).toBe(
        `customers/${adAccountId}/adGroupAds/${adSetId}~${adId}`
      );
    });

    it('should throw error when integration is not found', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue(null);

      await expect(
        updateGoogleAdStatus(adAccountId, accountId, adSetId, adId, true)
      ).rejects.toThrow('Google Ads integration not found');
    });

    it('should throw error when refresh token is missing', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue({
        ...mockIntegration,
        refresh_token: null,
      } as any);

      await expect(
        updateGoogleAdStatus(adAccountId, accountId, adSetId, adId, true)
      ).rejects.toThrow('Google Ads refresh token not found');
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Ad not found');
      mockAdGroupAdsUpdate.mockRejectedValue(apiError);

      await expect(
        updateGoogleAdStatus(adAccountId, accountId, adSetId, adId, true)
      ).rejects.toThrow('Ad not found');
    });
  });

  describe('Integration Validation', () => {
    const adAccountId = '1234567890';
    const accountId = 123;

    it('should validate integration data for all update functions', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue(null);

      await expect(
        updateGoogleCampaignStatus(adAccountId, accountId, '111', true)
      ).rejects.toThrow('Google Ads integration not found');

      await expect(
        updateGoogleCampaignBudget(adAccountId, accountId, '111', 100)
      ).rejects.toThrow('Google Ads integration not found');

      await expect(updateGoogleAdSetStatus(adAccountId, accountId, '222', true)).rejects.toThrow(
        'Google Ads integration not found'
      );

      await expect(
        updateGoogleAdStatus(adAccountId, accountId, '222', '333', true)
      ).rejects.toThrow('Google Ads integration not found');
    });

    it('should validate refresh token for all update functions', async () => {
      vi.mocked(getIntegrationData).mockResolvedValue({
        ...mockIntegration,
        refresh_token: null,
      } as any);

      await expect(
        updateGoogleCampaignStatus(adAccountId, accountId, '111', true)
      ).rejects.toThrow('Google Ads refresh token not found');

      await expect(
        updateGoogleCampaignBudget(adAccountId, accountId, '111', 100)
      ).rejects.toThrow('Google Ads refresh token not found');

      await expect(updateGoogleAdSetStatus(adAccountId, accountId, '222', true)).rejects.toThrow(
        'Google Ads refresh token not found'
      );

      await expect(
        updateGoogleAdStatus(adAccountId, accountId, '222', '333', true)
      ).rejects.toThrow('Google Ads refresh token not found');
    });
  });
});
