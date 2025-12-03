import { Router, Response } from 'express';
import { authenticateUser } from '@/middleware/auth.js';
import { requireAnyRole, AuthenticatedRequestWithRole } from '@/middleware/rbac.js';
import { asyncHandler } from '@/middleware/error.js';
import { EventBasedOrdersAttributionService } from '@/services/event-based-orders-attribution.js';
import { z } from 'zod';
import logger from '@/config/logger.js';
import { handleValidationError, formatValidationErrors } from '@/utils/validation-helpers.js';

const router = Router();
const eventBasedOrdersAttributionService = new EventBasedOrdersAttributionService();

// Validation schema for event-based orders attribution request
// Note: No attribution_window parameter - event-based attribution is always lifetime
const eventBasedOrdersAttributionSchema = z.object({
  account_id: z.string(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  attribution_model: z.enum([
    'first_click',
    'last_click',
    'last_paid_click',
    'linear_all',
    'linear_paid',
  ]),
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
 * GET /api/event-analytics/orders-attribution
 * Get order IDs and order numbers for given event-based attribution parameters
 *
 * Unlike order-based attribution which uses pre-calculated tables and attribution windows,
 * this endpoint queries int_event_metadata directly based on event timestamps.
 */
router.get(
  '/orders-attribution',
  authenticateUser,
  requireAnyRole,
  asyncHandler(async (req: AuthenticatedRequestWithRole, res: Response) => {
    try {
      // Validate query parameters
      const validationResult = eventBasedOrdersAttributionSchema.safeParse(req.query);

      if (handleValidationError(validationResult, res, {
        userId: req.user?.id,
        endpoint: 'event-based-orders-attribution',
      })) {
        return;
      }

      const params = validationResult.data;

      logger.info('Event-based orders attribution request', {
        userId: req.user?.id,
        accountId: params.account_id,
        channel: params.channel,
        model: params.attribution_model,
        dateRange: `${params.start_date} to ${params.end_date}`,
      });

      // Call service
      const result = await eventBasedOrdersAttributionService.getOrdersForEventAttribution({
        accountId: params.account_id,
        startDate: params.start_date,
        endDate: params.end_date,
        attributionModel: params.attribution_model,
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
      logger.error('Error in event-based orders attribution endpoint', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  })
);

export default router;
