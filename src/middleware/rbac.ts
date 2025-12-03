import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.js';
import { supabaseConnection } from '@/database/supabase/connection.js';
import logger from '@/config/logger.js';

export type UserRole = 'admin' | 'editor' | 'viewer';

// Extend the AuthenticatedRequest interface to include role information
export interface AuthenticatedRequestWithRole extends AuthenticatedRequest {
  user: AuthenticatedRequest['user'] & {
    role?: UserRole;
    shop_name?: string;
  };
}

/**
 * Fetches the user's role for a specific shop
 */
export async function getUserRoleForShop(userId: string, shopName: string): Promise<UserRole | null> {
  try {
    const serviceSupabase = supabaseConnection.getServiceClient();

    const { data, error } = await serviceSupabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('shop_name', shopName)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No role found - this is expected for new users
        return null;
      }
      logger.error('Error fetching user role:', error);
      return null;
    }

    return (data?.role as UserRole) || null;
  } catch (error) {
    logger.error('Unexpected error fetching user role:', error);
    return null;
  }
}

/**
 * Get shop name from account ID
 */
export async function getShopNameFromAccountId(accountId: string): Promise<string | null> {
  try {
    const serviceSupabase = supabaseConnection.getServiceClient();

    const { data, error } = await serviceSupabase
      .from('shopify_shops')
      .select('shop_name')
      .eq('account_id', accountId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No shop found for account
        logger.warn(`No shop found for account_id: ${accountId}`);
        return null;
      }
      logger.error('Error fetching shop name from account:', error);
      return null;
    }

    return data?.shop_name || null;
  } catch (error) {
    logger.error('Unexpected error fetching shop name:', error);
    return null;
  }
}

/**
 * Middleware to check if user has required role for the shop
 * This should be used AFTER authenticateUser middleware
 */
export function requireRole(allowedRoles: UserRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Get shop_name from query params, body, or params (support both snake_case and camelCase)
      let shopName = req.query.shop_name || req.body.shop_name || req.params.shop_name || req.params.shopName;

      // If no shop_name, try to get it from account_id or account (legacy support, support both snake_case and camelCase)
      if (!shopName) {
        const accountId =
          req.query.account_id ||
          req.query.account ||
          req.body.account_id ||
          req.body.account ||
          req.params.account_id ||
          req.params.account ||
          req.params.accountId;

        if (accountId) {
          logger.debug(
            `No shop_name provided, attempting to resolve from account_id: ${accountId}`
          );
          const resolvedShopName = await getShopNameFromAccountId(accountId as string);

          if (!resolvedShopName) {
            res.status(404).json({ error: 'Shop not found for the provided account_id' });
            return;
          }

          shopName = resolvedShopName;
          logger.debug(`Resolved shop_name: ${shopName} from account_id: ${accountId}`);
        } else {
          res.status(400).json({ error: 'Either shop_name, account_id, or account is required' });
          return;
        }
      }

      // Fetch user's role for this shop
      const userRole = await getUserRoleForShop(req.user.id, shopName as string);

      if (!userRole) {
        logger.warn(`User ${req.user.id} has no role for shop ${shopName}`);
        res.status(403).json({ error: 'Access denied: No permissions for this shop' });
        return;
      }

      // Check if user's role is in the allowed roles
      if (!allowedRoles.includes(userRole)) {
        logger.warn(
          `User ${req.user.id} with role ${userRole} denied access to ${req.method} ${req.path}`
        );
        res.status(403).json({
          error: 'Access denied: Insufficient permissions',
          required: allowedRoles,
          current: userRole,
        });
        return;
      }

      // Attach role and shop_name to request for downstream use
      const reqWithRole = req as AuthenticatedRequestWithRole;
      reqWithRole.user = {
        ...req.user!,
        role: userRole,
        shop_name: shopName as string,
      };

      logger.debug(
        `User ${req.user.id} with role ${userRole} granted access to ${req.method} ${req.path}`
      );
      next();
    } catch (error) {
      logger.error('RBAC middleware error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Shorthand middleware for admin-only endpoints
 */
export const requireAdmin = requireRole(['admin']);

/**
 * Shorthand middleware for admin and editor endpoints
 */
export const requireEditor = requireRole(['admin', 'editor']);

/**
 * Shorthand middleware for all authenticated users with any role
 */
export const requireAnyRole = requireRole(['admin', 'editor', 'viewer']);

/**
 * Check if a user has a specific role (utility function)
 */
export function hasRole(userRole: UserRole | undefined, allowedRoles: UserRole[]): boolean {
  return userRole !== undefined && allowedRoles.includes(userRole);
}

/**
 * Get all shops a user has access to
 */
export async function getUserShops(
  userId: string
): Promise<Array<{ shop_name: string; role: UserRole }>> {
  try {
    const serviceSupabase = supabaseConnection.getServiceClient();

    const { data, error } = await serviceSupabase
      .from('user_roles')
      .select('shop_name, role')
      .eq('user_id', userId)
      .order('shop_name');

    if (error) {
      logger.error('Error fetching user shops:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error('Unexpected error fetching user shops:', error);
    return [];
  }
}
