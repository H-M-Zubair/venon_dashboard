/**
 * Account and Shop Utilities
 *
 * Common utilities for account validation and shop data retrieval
 * to eliminate duplication across controllers and services.
 */

import logger from '@/config/logger.js';
import { AppError } from '@/middleware/error.js';

/**
 * Validates that a user has access to a specific account
 * Checks both account ownership and role-based access
 *
 * @param userId - The ID of the user requesting access
 * @param requestedAccountId - The account ID being accessed
 * @throws {AppError} If user doesn't have access to the account
 */
export async function validateUserAccountAccess(
  userId: string,
  requestedAccountId: string
): Promise<void> {
  // Import here to avoid circular dependency
  const { supabaseConnection } = await import('@/database/supabase/connection.js');
  const supabase = supabaseConnection.getServiceClient();

  logger.info('Validating user account access', { userId, requestedAccountId });

  // First check if the user owns the account
  const { data: accountData, error: accountError } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('id', requestedAccountId)
    .single();

  if (!accountError && accountData) {
    logger.info('User owns the account', { userId, accountId: accountData.id });
    return; // User owns the account, access granted
  }

  // If user doesn't own the account, check if they have a role
  const { data: roleData, error: roleError } = await supabase
    .from('accounts')
    .select(
      `
      id,
      shopify_shops!inner (
        shop_name,
        user_roles!inner (
          user_id,
          role
        )
      )
    `
    )
    .eq('id', requestedAccountId)
    .eq('shopify_shops.user_roles.user_id', userId)
    .single();

  if (!roleError && roleData) {
    logger.info('User has role-based access to account', {
      userId,
      accountId: roleData.id,
      role: roleData.shopify_shops[0]?.user_roles[0]?.role,
    });
    return; // User has role-based access, access granted
  }

  // Neither owner nor role-based access
  logger.warn('User attempted to access unauthorized account', {
    userId,
    requestedAccountId,
    ownerError: accountError?.message,
    roleError: roleError?.message,
  });
  throw new AppError('Access denied to this account', 403);
}

/**
 * Retrieves the shop name associated with an account ID
 *
 * @param accountId - The account ID to look up
 * @returns The shop name
 * @throws {Error} If shop is not found for the account
 */
export async function getShopNameFromAccountId(accountId: string): Promise<string> {
  const { supabaseConnection } = await import('@/database/supabase/connection.js');
  const supabase = supabaseConnection.getServiceClient();

  const { data: shopData, error: shopError } = await supabase
    .from('shopify_shops')
    .select('shop_name')
    .eq('account_id', accountId)
    .single();

  if (shopError || !shopData) {
    logger.error('Failed to find shop for account', { accountId, shopError });
    throw new Error('Shop not found for account');
  }

  logger.debug('Resolved shop name from account', {
    accountId,
    shopName: shopData.shop_name,
  });

  return shopData.shop_name;
}

/**
 * Retrieves full shop data associated with an account ID
 * More flexible version for cases where more than just shop_name is needed
 *
 * @param accountId - The account ID to look up
 * @param selectFields - Fields to select (default: 'shop_name')
 * @returns The shop data
 * @throws {Error} If shop is not found for the account
 */
export async function getShopDataFromAccountId<T = { shop_name: string }>(
  accountId: string,
  selectFields: string = 'shop_name'
): Promise<T> {
  const { supabaseConnection } = await import('@/database/supabase/connection.js');
  const supabase = supabaseConnection.getServiceClient();

  const { data: shopData, error: shopError } = await supabase
    .from('shopify_shops')
    .select(selectFields)
    .eq('account_id', accountId)
    .single();

  if (shopError || !shopData) {
    logger.error('Failed to find shop for account', { accountId, shopError });
    throw new Error('Shop not found for account');
  }

  logger.debug('Resolved shop data from account', { accountId, fields: selectFields });

  return shopData as T;
}
