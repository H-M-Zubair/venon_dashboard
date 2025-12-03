import { supabaseConnection } from '@/database/supabase/connection.js';
import { Integration } from '@/types/ads.js';
import logger from '@/config/logger.js';

/**
 * Fetches integration data for a specific platform and account
 * @param platform - The platform type (e.g., 'google-ads', 'meta-ads')
 * @param accountId - The account ID
 * @returns Integration data or null if not found
 */
export async function getIntegrationData(
  platform: string,
  accountId: number
): Promise<Integration | null> {
  try {
    const supabase = supabaseConnection.getServiceClient();

    const { data: currentIntegration, error } = await supabase
      .from('integrations')
      .select(
        `
        id,
        access_token,
        account_id,
        ad_account_id,
        client_id,
        client_secret,
        connected,
        error,
        expires_at,
        external_user_id,
        type,
        refresh_token
      `
      )
      .eq('type', platform)
      .eq('account_id', accountId)
      .single();

    if (error) {
      logger.warn('Integration not found:', {
        platform,
        accountId,
        error: error.message,
      });
      return null;
    }

    return currentIntegration as unknown as Integration;
  } catch (error) {
    logger.error('Error fetching integration data:', error);
    return null;
  }
}
