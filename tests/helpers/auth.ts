/**
 * Auth Helpers for Integration Tests
 *
 * These helpers get authentication tokens and test data from the local Supabase instance.
 * They're used in integration tests to authenticate requests.
 */

import { supabaseConnection } from '@/database/supabase/connection.js';
import logger from '@/config/logger.js';

/**
 * Gets an auth token for testing
 * First tries environment variable, then attempts to sign in
 */
export async function getTestAuthToken(): Promise<string> {
  // Option 1: Use environment variable (recommended)
  if (process.env.TEST_AUTH_TOKEN) {
    logger.debug('Using TEST_AUTH_TOKEN from environment');
    return process.env.TEST_AUTH_TOKEN;
  }

  // Option 2: Sign in programmatically (requires TEST_USER_EMAIL and TEST_USER_PASSWORD)
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'No test auth token available. Set TEST_AUTH_TOKEN or TEST_USER_EMAIL/TEST_USER_PASSWORD in .env.test'
    );
  }

  logger.debug('Signing in test user', { email });
  const supabase = supabaseConnection.getClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    logger.error('Failed to get test auth token', { error });
    throw new Error(`Failed to get test auth token: ${error?.message}`);
  }

  logger.debug('Successfully obtained test auth token');
  return data.session.access_token;
}

/**
 * Gets a test account ID from local Supabase
 * Uses environment variable or queries the first available account
 */
export async function getTestAccountId(): Promise<string> {
  // Option 1: Use environment variable (recommended)
  if (process.env.TEST_ACCOUNT_ID) {
    logger.debug('Using TEST_ACCOUNT_ID from environment');
    return process.env.TEST_ACCOUNT_ID;
  }

  // Option 2: Query first account from local Supabase
  logger.debug('Querying first account from local Supabase');
  const supabase = supabaseConnection.getServiceClient();

  const { data, error } = await supabase
    .from('accounts')
    .select('id')
    .limit(1)
    .single();

  if (error || !data) {
    logger.error('No test account found', { error });
    throw new Error('No test account found in local Supabase');
  }

  logger.debug('Found test account', { accountId: data.id });
  return data.id;
}

/**
 * Gets a test shop name from local Supabase
 */
export async function getTestShopName(): Promise<string> {
  if (process.env.TEST_SHOP_NAME) {
    return process.env.TEST_SHOP_NAME;
  }

  const supabase = supabaseConnection.getServiceClient();

  const { data, error } = await supabase
    .from('shopify_shops')
    .select('shop_name')
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error('No test shop found in local Supabase');
  }

  return data.shop_name;
}
