import { Response } from 'express';
import { AuthenticatedRequestWithRole } from '@/middleware/rbac.js';
import { supabaseConnection } from '@/database/supabase/connection.js';
import { asyncHandler } from '@/middleware/error.js';
import logger from '@/config/logger.js';

export class ShopifyController {
  /**
   * Get sync status for a shop
   * GET /api/shopify/sync-status/:shopName
   * Authorization handled by requireAnyRole middleware
   */
  getSyncStatus = asyncHandler(async (req: AuthenticatedRequestWithRole, res: Response): Promise<void> => {
    try {
      const { shopName } = req.params;
      const supabase = supabaseConnection.getServiceClient();

      // Get shop data (authorization already handled by middleware)
      const { data: shop, error } = await supabase
        .from('shopify_shops')
        .select('sync_status, sync_progress, sync_error, sync_completed_at, granted_scopes')
        .eq('shop_name', shopName)
        .single();

      if (error) {
        logger.error('Error fetching shop sync status', { error, shopName });
        res.status(404).json({
          success: false,
          error: 'Shop not found',
        });
        return;
      }

      const hasReadAllOrders = shop.granted_scopes?.includes('read_all_orders') || false;
      const progress = shop.sync_progress || { synced: 0, last_cursor: null };

      res.json({
        success: true,
        shopName,
        hasReadAllOrders,
        syncStatus: shop.sync_status,
        progress: {
          synced: progress.synced || 0,
          lastCursor: progress.last_cursor,
          startedAt: progress.started_at,
        },
        syncError: shop.sync_error,
        syncCompletedAt: shop.sync_completed_at,
        needsUpgrade: !hasReadAllOrders,
      });
    } catch (error) {
      logger.error('Error in getSyncStatus', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * Trigger manual sync for a shop
   * POST /api/shopify/trigger-sync/:shopName
   * Authorization handled by requireAdmin middleware
   */
  triggerSync = asyncHandler(async (req: AuthenticatedRequestWithRole, res: Response): Promise<void> => {
    try {
      const { shopName } = req.params;
      const supabase = supabaseConnection.getServiceClient();

      // Get shop data (authorization already handled by middleware)
      const { data: shop, error: fetchError } = await supabase
        .from('shopify_shops')
        .select('granted_scopes, sync_status')
        .eq('shop_name', shopName)
        .single();

      if (fetchError || !shop) {
        logger.error('Shop not found for trigger sync', { shopName, error: fetchError });
        res.status(404).json({
          success: false,
          error: 'Shop not found',
        });
        return;
      }

      // Check if shop has read_all_orders permission
      const hasReadAllOrders = shop.granted_scopes?.includes('read_all_orders') || false;
      if (!hasReadAllOrders) {
        res.status(403).json({
          success: false,
          error: 'Shop does not have read_all_orders permission',
          needsReAuth: true,
        });
        return;
      }

      // Check if sync is already in progress
      if (shop.sync_status === 'in_progress') {
        res.status(409).json({
          success: false,
          error: 'Sync already in progress',
        });
        return;
      }

      // Check if already completed
      if (shop.sync_status === 'completed') {
        res.status(200).json({
          success: true,
          message: 'Sync already completed',
          shopName,
        });
        return;
      }

      // Mark sync as not_started (Cloud Run Job will pick it up)
      const { error: updateError } = await supabase
        .from('shopify_shops')
        .update({
          sync_status: 'not_started',
          sync_error: null,
        })
        .eq('shop_name', shopName);

      if (updateError) {
        logger.error('Error triggering sync', { error: updateError, shopName });
        res.status(500).json({
          success: false,
          error: 'Failed to trigger sync',
        });
        return;
      }

      logger.info('Manual sync triggered', { shopName });

      res.json({
        success: true,
        message: 'Sync triggered successfully. Cloud Run Job will process within 15 minutes.',
        shopName,
      });
    } catch (error) {
      logger.error('Error in triggerSync', { error });
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  });
}
