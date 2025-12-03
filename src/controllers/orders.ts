import { Response } from 'express';
import { OrdersService } from '@/services/orders.js';
import { AuthenticatedRequestWithRole } from '@/middleware/rbac.js';
import { AppError, asyncHandler } from '@/middleware/error.js';
import logger from '@/config/logger.js';
import { z } from 'zod';

// Query validation schema
const shopifyOrdersQuerySchema = z.object({
  shop_name: z.string().min(1, 'shop_name is required'),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be in YYYY-MM-DD format'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be in YYYY-MM-DD format'),
});

export class OrdersController {
  private ordersService: OrdersService;

  constructor() {
    this.ordersService = new OrdersService();
  }

  /**
   * Validate that the user has access to the requested shop
   * This checks both ownership and role-based access
   */
  private async validateUserShopAccess(userId: string, shopName: string): Promise<void> {
    const { supabaseConnection } = await import('@/database/supabase/connection.js');
    const supabase = supabaseConnection.getServiceClient();

    logger.info('Validating user shop access for orders', { userId, shopName });

    // First check if the user owns the shop (through account)
    const { data: ownerData, error: ownerError } = await supabase
      .from('shopify_shops')
      .select(
        `
        shop_name,
        accounts!inner (
          user_id
        )
      `
      )
      .eq('shop_name', shopName)
      .eq('accounts.user_id', userId)
      .single();

    if (!ownerError && ownerData) {
      logger.info('User owns the shop', { userId, shopName });
      return;
    }

    // If user doesn't own the shop, check if they have a role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('shop_name', shopName)
      .eq('user_id', userId)
      .single();

    if (!roleError && roleData) {
      logger.info('User has role-based access to shop', {
        userId,
        shopName,
        role: roleData.role,
      });
      return;
    }

    // Neither owner nor role-based access
    logger.warn('User attempted to access unauthorized shop for orders', {
      userId,
      shopName,
      ownerError: ownerError?.message,
      roleError: roleError?.message,
    });
    throw new AppError('Access denied to this shop', 403);
  }

  /**
   * Format dates for timezone handling
   * Converts shop-local dates to UTC timestamps for database queries
   */
  private formatDatesForTimezone(
    startDate: string,
    endDate: string,
    timezone: string
  ): { startDate: string; endDate: string } {
    const moment = require('moment-timezone');

    // Create start of day in shop timezone and convert to UTC
    const start = moment.tz(startDate, timezone).startOf('day').utc().format();

    // Create end of day in shop timezone and convert to UTC
    const end = moment.tz(endDate, timezone).endOf('day').utc().format();

    return { startDate: start, endDate: end };
  }

  /**
   * Get recent Shopify orders for an account
   */
  getShopifyOrders = asyncHandler(
    async (req: AuthenticatedRequestWithRole, res: Response): Promise<void> => {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const userId = req.user.id;

      logger.info('Shopify orders request', {
        userId,
        role: req.user.role,
        shop: req.user.shop_name,
        query: req.query,
      });

      // Validate query parameters
      const validationResult = shopifyOrdersQuerySchema.safeParse(req.query);
      if (!validationResult.success) {
        logger.warn('Invalid query parameters for Shopify orders', {
          errors: validationResult.error.errors,
          query: req.query,
        });
        throw new AppError(
          `Invalid query parameters: ${validationResult.error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join(', ')}`,
          400
        );
      }

      const params = validationResult.data;

      // Verify the user has access to the requested shop
      await this.validateUserShopAccess(userId, params.shop_name);

      // Get timezone for the shop
      const timezone = await this.ordersService.getShopTimezone(params.shop_name);

      // Format dates for the timezone
      const { startDate, endDate } = this.formatDatesForTimezone(
        params.start_date,
        params.end_date,
        timezone
      );

      // Get the orders
      const orders = await this.ordersService.getRecentOrdersByShop(
        params.shop_name,
        startDate,
        endDate,
        timezone
      );

      logger.info('Successfully retrieved Shopify orders', {
        userId,
        shopName: params.shop_name,
        orderCount: orders.length,
      });

      res.json({
        success: true,
        orders,
        metadata: {
          shop_name: params.shop_name,
          start_date: params.start_date,
          end_date: params.end_date,
          timezone,
          total_orders: orders.length,
          query_timestamp: new Date().toISOString(),
        },
      });
    }
  );
}
