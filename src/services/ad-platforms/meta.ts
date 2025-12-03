import {
  FacebookAdsApi,
  Campaign as FacebookCampaign,
  AdSet as FacebookAdSet,
  Ad as FacebookAd,
} from 'facebook-nodejs-business-sdk';
import { getIntegrationData } from '@/services/integrations.js';
import { FacebookPermissionError } from '@/middleware/error.js';
import { env } from '@/config/environment.js';
import logger from '@/config/logger.js';

/**
 * Handles Facebook API errors and provides user-friendly error messages
 * @param error - The error object from Facebook API
 * @param context - Context description of what operation failed
 * @param additionalInfo - Additional context for debugging
 * @throws FacebookPermissionError for permission errors, Error for other errors
 */
function handleFacebookError(error: any, context: string, additionalInfo?: any): never {
  // Log the full error details for debugging
  logger.error('Facebook API error details:', {
    context,
    fullError: JSON.stringify(error, null, 2),
    errorResponse: error.response,
    errorMessage: error.message,
    errorStack: error.stack,
    additionalInfo,
  });

  // Check if it's a Facebook API error with detailed info
  if (error.response?.error) {
    const fbError = error.response.error;
    const errorMessage = fbError.message || '';
    const errorCode = fbError.code;

    // Detect permission errors (error code 100 with specific message patterns)
    if (
      errorCode === 100 &&
      (errorMessage.includes('missing permissions') ||
        errorMessage.includes('cannot be loaded due to missing permissions'))
    ) {
      throw new FacebookPermissionError();
    }

    // For other errors, provide detailed error info
    const userMessage = fbError.error_user_msg || fbError.message || 'Unknown Facebook error';
    const userTitle = fbError.error_user_title || 'Facebook API Error';
    const errorSubcode = fbError.error_subcode;

    throw new Error(
      `${userTitle}: ${userMessage} (Code: ${errorCode}, Subcode: ${errorSubcode}) - ${context}`
    );
  }

  // Check if error has a message property
  if (error.message) {
    throw new Error(`${context}: ${error.message}`);
  }

  // Fallback for unknown error types
  throw new Error(`${context}: ${String(error)}`);
}

/**
 * Initialize Facebook Ads API instance
 */
async function initFacebookApi(accountId: number): Promise<FacebookAdsApi> {
  const integration = await getIntegrationData('meta-ads', accountId);

  if (!integration) {
    throw new Error('Meta Ads integration not found');
  }

  if (!integration.access_token) {
    throw new Error('Meta Ads access token not found');
  }

  return FacebookAdsApi.init(integration.access_token);
}

/**
 * Simulates Facebook permission error for testing purposes
 * @throws Mock Facebook permission error if SIMULATE_FB_PERMISSION_ERROR is enabled
 */
function checkSimulatePermissionError(): void {
  if (env.SIMULATE_FB_PERMISSION_ERROR) {
    logger.warn('Simulating Facebook permission error for testing');
    throw {
      response: {
        error: {
          message:
            "Unsupported post request. Object with ID '120232877857978319' does not exist, cannot be loaded due to missing permissions, or does not support this operation.",
          code: 100,
        },
      },
    };
  }
}

/**
 * Update Meta/Facebook campaign status
 */
export async function updateMetaCampaignStatus(
  accountId: number,
  campaignId: string,
  enabled: boolean
): Promise<void> {
  try {
    checkSimulatePermissionError();

    const api = await initFacebookApi(accountId);

    logger.info('Attempting to update Facebook campaign status:', {
      campaignId,
      targetStatus: enabled ? 'ACTIVE' : 'PAUSED',
    });

    const fbCampaign = new FacebookCampaign(campaignId, { api });
    await fbCampaign.update([], {
      status: enabled ? 'ACTIVE' : 'PAUSED',
    });

    logger.info('Facebook campaign status updated successfully', {
      campaignId,
      newStatus: enabled ? 'ACTIVE' : 'PAUSED',
    });
  } catch (error) {
    handleFacebookError(error, 'Failed to update campaign status on Facebook', {
      campaignId,
      targetStatus: enabled ? 'ACTIVE' : 'PAUSED',
    });
  }
}

/**
 * Update Meta/Facebook campaign budget
 */
export async function updateMetaCampaignBudget(
  accountId: number,
  campaignId: string,
  budget: number
): Promise<void> {
  try {
    checkSimulatePermissionError();

    const api = await initFacebookApi(accountId);

    logger.info('Attempting to update Facebook campaign budget:', {
      campaignId,
      targetBudget: budget * 100,
    });

    const fbCampaign = new FacebookCampaign(campaignId, { api });
    await fbCampaign.update([], {
      daily_budget: budget * 100, // Facebook expects budget in cents
    });

    logger.info('Facebook campaign budget updated successfully', {
      campaignId,
      newBudget: budget * 100,
    });
  } catch (error) {
    handleFacebookError(error, 'Failed to update campaign budget on Facebook', {
      campaignId,
      targetBudget: budget * 100,
    });
  }
}

/**
 * Update Meta/Facebook ad set status
 */
export async function updateMetaAdSetStatus(
  accountId: number,
  adSetId: string,
  enabled: boolean
): Promise<void> {
  try {
    checkSimulatePermissionError();

    const api = await initFacebookApi(accountId);

    logger.info('Attempting to update Facebook ad set status:', {
      adSetId,
      targetStatus: enabled ? 'ACTIVE' : 'PAUSED',
    });

    const fbAdSet = new FacebookAdSet(adSetId, { api });
    await fbAdSet.update([], {
      status: enabled ? 'ACTIVE' : 'PAUSED',
    });

    logger.info('Facebook ad set status updated successfully', {
      adSetId,
      newStatus: enabled ? 'ACTIVE' : 'PAUSED',
    });
  } catch (error) {
    handleFacebookError(error, 'Failed to update ad set status on Facebook', {
      adSetId,
      targetStatus: enabled ? 'ACTIVE' : 'PAUSED',
    });
  }
}

/**
 * Update Meta/Facebook ad set budget
 */
export async function updateMetaAdSetBudget(
  accountId: number,
  adSetId: string,
  budget: number
): Promise<void> {
  try {
    checkSimulatePermissionError();

    const api = await initFacebookApi(accountId);

    logger.info('Attempting to update Facebook ad set budget:', {
      adSetId,
      targetBudget: budget * 100,
    });

    const fbAdSet = new FacebookAdSet(adSetId, { api });
    await fbAdSet.update([], {
      daily_budget: budget * 100, // Facebook expects budget in cents
    });

    logger.info('Facebook ad set budget updated successfully', {
      adSetId,
      newBudget: budget * 100,
    });
  } catch (error) {
    handleFacebookError(error, 'Failed to update ad set budget on Facebook', {
      adSetId,
      targetBudget: budget * 100,
    });
  }
}

/**
 * Update Meta/Facebook ad status
 */
export async function updateMetaAdStatus(
  accountId: number,
  adId: string,
  enabled: boolean
): Promise<void> {
  try {
    checkSimulatePermissionError();

    const api = await initFacebookApi(accountId);

    logger.info('Attempting to update Facebook ad status:', {
      adId,
      targetStatus: enabled ? 'ACTIVE' : 'PAUSED',
    });

    const fbAd = new FacebookAd(adId, { api });
    await fbAd.update([], {
      status: enabled ? 'ACTIVE' : 'PAUSED',
    });

    logger.info('Facebook ad status updated successfully', {
      adId,
      newStatus: enabled ? 'ACTIVE' : 'PAUSED',
    });
  } catch (error) {
    handleFacebookError(error, 'Failed to update ad status on Facebook', {
      adId,
      targetStatus: enabled ? 'ACTIVE' : 'PAUSED',
    });
  }
}
