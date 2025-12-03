import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { AuthenticatedRequestWithRole, getUserRoleForShop, getUserShops } from '../middleware/rbac';
import { UsersService } from '../services/users';
import { asyncHandler, AppError } from '../middleware/error';
import logger from '../config/logger';

export class UsersController {
  /**
   * Get current user information
   * Supports optional ?shop_name query parameter to get role for specific shop
   * If not provided, returns role for the first shop the user has access to (alphabetically)
   */
  getCurrentUser = asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('User not authenticated', 401);
    }

    // Fetch shop_name and role from database
    let shopName: string | null = null;
    let role: string | null = null;

    try {
      // Check if a specific shop is requested via query parameter
      const requestedShop = req.query.shop_name as string | undefined;

      if (requestedShop) {
        // User requested a specific shop - return role for that shop
        shopName = requestedShop;
        role = await getUserRoleForShop(req.user.id, shopName);

        // If user doesn't have access to this shop, role will be null
        if (!role) {
          logger.debug('User requested shop they dont have access to', {
            userId: req.user.id,
            requestedShop
          });
        }
      } else {
        // No specific shop requested - return first shop user has access to
        const userShops = await getUserShops(req.user.id);
        const firstShop = userShops[0];
        if (firstShop) {
          shopName = firstShop.shop_name;
          role = firstShop.role;
        }
        // If no shops, shopName and role remain null
      }
    } catch (error) {
      // Shop may not exist yet (onboarding), so return null
      logger.debug('Could not fetch shop or role for user', { userId: req.user.id, error });
    }

    // Return the current user's information
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        role: role || null,
        shop_name: shopName || null,
      },
    });
  });

  /**
   * Get all users for a shop (admin only)
   */
  getShopUsers = asyncHandler(
    async (req: AuthenticatedRequestWithRole, res: Response): Promise<void> => {
      const shopName = req.query.shop_name as string;

      if (!shopName) {
        throw new AppError('shop_name is required', 400);
      }

      // Check if user is admin (handled by requireAdmin middleware)
      if (!req.user || req.user.role !== 'admin' || req.user.shop_name !== shopName) {
        throw new AppError('Access denied', 403);
      }

      const users = await UsersService.getShopUsers(shopName);
      res.json({ users });
    }
  );

  /**
   * Invite a user to a shop (admin only)
   */
  inviteUser = asyncHandler(
    async (req: AuthenticatedRequestWithRole, res: Response): Promise<void> => {
      const { email, shop_name, role } = req.body;

      if (!email || !shop_name || !role) {
        throw new AppError('email, shop_name, and role are required', 400);
      }

      // Normalize and validate email
      const normalizedEmail = email.trim().toLowerCase();

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(normalizedEmail)) {
        throw new AppError('Invalid email format', 400);
      }

      if (!['admin', 'editor', 'viewer'].includes(role)) {
        throw new AppError('Invalid role. Must be admin, editor, or viewer', 400);
      }

      // Check if user is admin (handled by requireAdmin middleware)
      if (!req.user || req.user.role !== 'admin' || req.user.shop_name !== shop_name) {
        throw new AppError('Access denied', 403);
      }

      await UsersService.inviteUserToShop(normalizedEmail, shop_name, role);
      res.json({ message: 'User invited successfully' });
    }
  );

  /**
   * Update a user's role (admin only)
   */
  updateUserRole = asyncHandler(
    async (req: AuthenticatedRequestWithRole, res: Response): Promise<void> => {
      const { user_id, shop_name, role } = req.body;

      if (!user_id || !shop_name || !role) {
        throw new AppError('user_id, shop_name, and role are required', 400);
      }

      if (!['admin', 'editor', 'viewer'].includes(role)) {
        throw new AppError('Invalid role. Must be admin, editor, or viewer', 400);
      }

      // Check if user is admin (handled by requireAdmin middleware)
      if (!req.user || req.user.role !== 'admin' || req.user.shop_name !== shop_name) {
        throw new AppError('Access denied', 403);
      }

      // Prevent admin from changing their own role
      if (user_id === req.user.id) {
        throw new AppError('You cannot change your own role', 400);
      }

      await UsersService.updateUserRole(user_id, shop_name, role);
      res.json({ message: 'Role updated successfully' });
    }
  );

  /**
   * Remove a user from a shop (admin only)
   */
  removeUser = asyncHandler(
    async (req: AuthenticatedRequestWithRole, res: Response): Promise<void> => {
      const { user_id, shop_name } = req.body;

      if (!user_id || !shop_name) {
        throw new AppError('user_id and shop_name are required', 400);
      }

      // Check if user is admin (handled by requireAdmin middleware)
      if (!req.user || req.user.role !== 'admin' || req.user.shop_name !== shop_name) {
        throw new AppError('Access denied', 403);
      }

      // Prevent admin from removing themselves
      if (user_id === req.user.id) {
        throw new AppError('You cannot remove yourself', 400);
      }

      await UsersService.removeUserFromShop(user_id, shop_name);
      res.json({ message: 'User removed successfully' });
    }
  );
}
