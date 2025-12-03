import { supabaseConnection } from '@/database/supabase/connection';
import logger from '@/config/logger';
import { AppError } from '@/middleware/error';

export interface UserRole {
  user_id: string;
  shop_name: string;
  role: 'admin' | 'editor' | 'viewer';
  email?: string;
}

export interface UserWithRole extends UserRole {
  users?: {
    email: string;
  };
}

export class UsersService {
  /**
   * Get all users with roles for a specific shop
   */
  static async getShopUsers(shopName: string): Promise<UserWithRole[]> {
    try {
      const supabase = supabaseConnection.getServiceClient();

      // First get all user roles for the shop
      const { data: userRoles, error } = await supabase
        .from('user_roles')
        .select(
          `
          user_id,
          shop_name,
          role
        `
        )
        .eq('shop_name', shopName);

      if (error) {
        logger.error('Error fetching shop users:', error);
        throw new Error('Failed to fetch shop users');
      }

      if (!userRoles || userRoles.length === 0) {
        return [];
      }

      // Get user emails from auth.users by fetching each user individually
      // This avoids the 50 user limit of listUsers()
      const usersWithEmails = await Promise.all(
        userRoles.map(async (userRole) => {
          try {
            const {
              data: { user },
              error,
            } = await supabase.auth.admin.getUserById(userRole.user_id);

            if (error) {
              logger.error(`Error fetching user ${userRole.user_id}:`, error);
              return {
                ...userRole,
                email: 'Unknown',
              };
            }

            return {
              ...userRole,
              email: user?.email || 'Unknown',
            };
          } catch (error) {
            logger.error(`Unexpected error fetching user ${userRole.user_id}:`, error);
            return {
              ...userRole,
              email: 'Unknown',
            };
          }
        })
      );

      // Filter out support@venon.io from the response to hide support access
      const filteredUsers = usersWithEmails.filter((user) => user.email !== 'support@venon.io');

      return filteredUsers;
    } catch (error) {
      logger.error('Error in getShopUsers:', error);
      throw error;
    }
  }

  /**
   * Invite a user to a shop with a specific role
   */
  static async inviteUserToShop(
    email: string,
    shopName: string,
    role: 'admin' | 'editor' | 'viewer'
  ): Promise<void> {
    // Normalize email to lowercase and trim whitespace for consistent comparison
    const normalizedEmail = email.toLowerCase().trim();

    try {
      logger.info(`Starting invitation process for ${normalizedEmail} to shop ${shopName} with role ${role}`);
      const supabase = supabaseConnection.getServiceClient();

      // Search for user with pagination to handle more than 50 users
      let existingUser = null;
      let page = 1;
      const perPage = 500; // Use max allowed per page

      while (!existingUser) {
        const {
          data: { users: authUsers },
          error: authError,
        } = await supabase.auth.admin.listUsers({
          page,
          perPage,
        });

        if (authError) {
          logger.error(`Error fetching users while inviting ${normalizedEmail} to shop ${shopName}:`, authError);
          throw new Error('Failed to check user existence');
        }

        // Check if user exists in this batch (case-insensitive comparison)
        existingUser = authUsers.find((u) => u.email?.toLowerCase() === normalizedEmail);

        // If we've fetched fewer users than requested, we've reached the end
        if (authUsers.length < perPage) {
          break;
        }

        page++;
      }

      if (!existingUser) {
        logger.error(`User not found: ${normalizedEmail} cannot be invited to shop ${shopName} - user must register first`);
        throw new AppError(
          'User does not exist. They need to register first before being invited.',
          400
        );
      }

      // Check if user already has a role for this shop
      const { data: existingRole, error: checkError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', existingUser.id)
        .eq('shop_name', shopName)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        logger.error(`Error checking existing role for ${normalizedEmail} in shop ${shopName}:`, checkError);
        throw new Error('Failed to check existing role');
      }

      if (existingRole) {
        logger.error(`User ${normalizedEmail} already has access to shop ${shopName} with role ${existingRole.role}`);
        throw new AppError('User already has access to this shop', 400);
      }

      // Add user role
      const { error: insertError } = await supabase.from('user_roles').insert({
        user_id: existingUser.id,
        shop_name: shopName,
        role: role,
      });

      if (insertError) {
        logger.error(`Error adding user role for ${normalizedEmail} to shop ${shopName} with role ${role}:`, insertError);
        throw new Error('Failed to add user to shop');
      }

      logger.info(`User ${normalizedEmail} invited to shop ${shopName} with role ${role}`);
    } catch (error) {
      logger.error(`Error in inviteUserToShop for ${normalizedEmail} to shop ${shopName} with role ${role}:`, error);
      throw error;
    }
  }

  /**
   * Update a user's role for a shop
   */
  static async updateUserRole(
    userId: string,
    shopName: string,
    newRole: 'admin' | 'editor' | 'viewer'
  ): Promise<void> {
    try {
      const supabase = supabaseConnection.getServiceClient();

      // Check if user has a role for this shop
      const { data: existingRole, error: checkError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('shop_name', shopName)
        .single();

      if (checkError || !existingRole) {
        logger.error('User role not found:', checkError);
        throw new Error('User role not found for this shop');
      }

      // Update the role
      const { error: updateError } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', userId)
        .eq('shop_name', shopName);

      if (updateError) {
        logger.error('Error updating user role:', updateError);
        throw new Error('Failed to update user role');
      }

      logger.info(`Updated role for user ${userId} in shop ${shopName} to ${newRole}`);
    } catch (error) {
      logger.error('Error in updateUserRole:', error);
      throw error;
    }
  }

  /**
   * Remove a user from a shop
   */
  static async removeUserFromShop(userId: string, shopName: string): Promise<void> {
    try {
      const supabase = supabaseConnection.getServiceClient();

      // Check if this would leave the shop without admins
      const { data: admins, error: adminCheckError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('shop_name', shopName)
        .eq('role', 'admin');

      if (adminCheckError) {
        logger.error('Error checking admins:', adminCheckError);
        throw new Error('Failed to check admin count');
      }

      if (admins && admins.length === 1 && admins[0]?.user_id === userId) {
        throw new Error('Cannot remove the last admin from the shop');
      }

      // Remove the user role
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('shop_name', shopName);

      if (deleteError) {
        logger.error('Error removing user role:', deleteError);
        throw new Error('Failed to remove user from shop');
      }

      logger.info(`Removed user ${userId} from shop ${shopName}`);
    } catch (error) {
      logger.error('Error in removeUserFromShop:', error);
      throw error;
    }
  }
}
