import { Router, Response } from 'express';
import { authenticateUser } from '@/middleware/auth.js';
import { requireAnyRole, AuthenticatedRequestWithRole } from '@/middleware/rbac.js';
import { asyncHandler } from '@/middleware/error.js';
import { OrdersAttributionService } from '@/services/orders-attribution.js';
import { z } from 'zod';
import logger from '@/config/logger.js';

const router = Router();
const ordersAttributionService = new OrdersAttributionService();

// Validation schema for orders attribution request
const ordersAttributionSchema = z.object({
  account_id: z.string(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  attribution_model: z.enum([
    'first_click',
    'last_click',
    'last_paid_click',
    'linear_all',
    'linear_paid',
    'all_clicks',
  ]),
  attribution_window: z.enum(['1_day', '7_day', '14_day', '28_day', '90_day', 'lifetime']),
  channel: z.string(),
  // For non-ad-spend channels
  campaign: z.string().optional(),
  // For ad-spend channels
  ad_campaign_pk: z.string().optional(),
  ad_set_pk: z.string().optional(),
  ad_pk: z.string().optional(),
  // Filter for first-time customers only
  first_time_customers_only: z.coerce.boolean().optional().default(false),
});

/**
 * GET /api/analytics/orders-attribution
 * Get order IDs and order numbers for given attribution parameters
 */
router.get(
  '/orders-attribution',
  authenticateUser,
  requireAnyRole,
  asyncHandler(async (req: AuthenticatedRequestWithRole, res: Response) => {
    try {
      // Validate query parameters
      const validationResult = ordersAttributionSchema.safeParse(req.query);

      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request parameters',
          details: validationResult.error.errors,
        });
      }

      const params = validationResult.data;

      // No specific validation needed - we can fetch orders for:
      // 1. Entire channel (no filters)
      // 2. Specific campaign/adset/ad (with PKs)
      // 3. Specific campaign name (for non-ad-spend channels)

      logger.info('Orders attribution request', {
        userId: req.user?.id,
        accountId: params.account_id,
        channel: params.channel,
        dateRange: `${params.start_date} to ${params.end_date}`,
      });

      // Call service
      const result = await ordersAttributionService.getOrdersForAttribution({
        accountId: params.account_id,
        startDate: params.start_date,
        endDate: params.end_date,
        attributionModel: params.attribution_model,
        attributionWindow: params.attribution_window,
        channel: params.channel,
        campaign: params.campaign,
        adCampaignPk: params.ad_campaign_pk,
        adSetPk: params.ad_set_pk,
        adPk: params.ad_pk,
        firstTimeCustomersOnly: params.first_time_customers_only,
      });

      if (!result.success) {
        return res.status(500).json(result);
      }

      return res.json(result);
    } catch (error) {
      logger.error('Error in orders attribution endpoint', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  })
);

export default router;
