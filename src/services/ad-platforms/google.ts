import { GoogleAdsApi, enums, Customer } from 'google-ads-api';
import { getIntegrationData } from '@/services/integrations.js';
import { env } from '@/config/environment.js';
import logger from '@/config/logger.js';

/**
 * Get Google Ads customer instance for API operations
 * @param adAccountId - The Google Ads customer ID
 * @param accountId - The internal account ID
 * @returns Google Ads Customer instance
 */
export async function getGoogleCustomer(
  adAccountId: string,
  accountId: number
): Promise<Customer> {
  const integration = await getIntegrationData('google-ads', accountId);

  if (!integration) {
    logger.error('No google-ads integration found', { adAccountId, accountId });
    throw new Error('Google Ads integration not found');
  }

  if (!integration.refresh_token) {
    logger.error('No refresh token found for Google Ads integration', {
      adAccountId,
      accountId,
    });
    throw new Error('Google Ads refresh token not found');
  }

  // Environment variables are guaranteed to exist by env schema validation
  const client: GoogleAdsApi = new GoogleAdsApi({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    developer_token: env.GOOGLE_DEVELOPER_ACCOUNT,
  });

  return client.Customer({
    customer_id: adAccountId,
    refresh_token: integration.refresh_token,
  });
}

/**
 * Update Google Ads campaign status
 */
export async function updateGoogleCampaignStatus(
  adAccountId: string,
  accountId: number,
  campaignId: string,
  enabled: boolean
): Promise<void> {
  const customer = await getGoogleCustomer(adAccountId, accountId);

  await customer.campaigns.update([
    {
      resource_name: `customers/${adAccountId}/campaigns/${campaignId}`,
      status: enabled ? enums.CampaignStatus.ENABLED : enums.CampaignStatus.PAUSED,
    },
  ]);

  logger.info('Google campaign status updated', {
    adAccountId,
    campaignId,
    enabled,
  });
}

/**
 * Update Google Ads campaign budget
 */
export async function updateGoogleCampaignBudget(
  adAccountId: string,
  accountId: number,
  campaignId: string,
  budget: number
): Promise<void> {
  const customer = await getGoogleCustomer(adAccountId, accountId);

  // Convert budget to micros (Google Ads API expects budget in micros)
  const budgetMicros = budget * 1000000;

  // Validate campaign ID contains only digits
  if (!/^\d+$/.test(campaignId)) {
    throw new Error('Invalid campaign ID: must contain only digits');
  }

  // Get the campaign to find its current budget ID
  const campaignQuery = `
    SELECT
      campaign.id,
      campaign.name,
      campaign_budget.id,
      campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.id = ${campaignId}
  `;

  const campaignResults = await customer.query(campaignQuery);

  if (!campaignResults || campaignResults.length === 0) {
    throw new Error('Campaign not found in Google Ads');
  }

  const campaignData = campaignResults[0];

  if (!campaignData || !campaignData.campaign_budget?.id) {
    throw new Error('Campaign budget not found in Google Ads');
  }

  const budgetId = campaignData.campaign_budget.id;

  // Update the campaign budget
  await customer.campaignBudgets.update([
    {
      resource_name: `customers/${adAccountId}/campaignBudgets/${budgetId}`,
      amount_micros: budgetMicros,
    },
  ]);

  logger.info('Google campaign budget updated', {
    adAccountId,
    campaignId,
    budget,
  });
}

/**
 * Update Google Ads ad group (ad set) status
 */
export async function updateGoogleAdSetStatus(
  adAccountId: string,
  accountId: number,
  adSetId: string,
  enabled: boolean
): Promise<void> {
  const customer = await getGoogleCustomer(adAccountId, accountId);

  await customer.adGroups.update([
    {
      resource_name: `customers/${adAccountId}/adGroups/${adSetId}`,
      status: enabled ? enums.AdGroupStatus.ENABLED : enums.AdGroupStatus.PAUSED,
    },
  ]);

  logger.info('Google ad group status updated', {
    adAccountId,
    adSetId,
    enabled,
  });
}

/**
 * Update Google Ads ad status
 */
export async function updateGoogleAdStatus(
  adAccountId: string,
  accountId: number,
  adSetId: string,
  adId: string,
  enabled: boolean
): Promise<void> {
  const customer = await getGoogleCustomer(adAccountId, accountId);

  // Google Ads resource name format: customers/{customer_id}/adGroupAds/{ad_group_id}~{ad_id}
  const resourceName = `customers/${adAccountId}/adGroupAds/${adSetId}~${adId}`;

  await customer.adGroupAds.update([
    {
      resource_name: resourceName,
      status: enabled ? enums.AdGroupAdStatus.ENABLED : enums.AdGroupAdStatus.PAUSED,
    },
  ]);

  logger.info('Google ad status updated', {
    adAccountId,
    adSetId,
    adId,
    enabled,
  });
}
