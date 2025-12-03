import { Router } from 'express';
import { authenticateUser } from '@/middleware/auth.js';
import { requireAnyRole, requireAdmin } from '@/middleware/rbac.js';
import { ShopifyController } from '@/controllers/shopify.js';

const router = Router();
const controller = new ShopifyController();

// All routes require authentication
router.use(authenticateUser);

/**
 * GET /api/shopify/sync-status/:shopName
 * Get the historical order sync status for a shop
 * Accessible to all roles (admin, editor, viewer)
 */
router.get('/sync-status/:shopName', requireAnyRole, controller.getSyncStatus);

/**
 * POST /api/shopify/trigger-sync/:shopName
 * Manually trigger historical order sync for a shop
 * (Marks sync_status as 'not_started' so Cloud Run Job picks it up)
 * Only accessible to shop admins
 */
router.post('/trigger-sync/:shopName', requireAdmin, controller.triggerSync);

export default router;
