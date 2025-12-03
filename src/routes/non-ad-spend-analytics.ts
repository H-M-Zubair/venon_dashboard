import { Router, Response } from 'express';
import { nonAdSpendAnalyticsRequestSchema } from '@/types/non-ad-spend-analytics.js';
import { NonAdSpendAnalyticsService } from '@/services/non-ad-spend-analytics.js';
import { authenticateUser } from '@/middleware/auth.js';
import { requireAnyRole, AuthenticatedRequestWithRole } from '@/middleware/rbac.js';
import { asyncHandler } from '@/middleware/error.js';
import { isAdSpendChannel } from '@/config/channels.js';
import logger from '@/config/logger.js';

const router = Router();
const nonAdSpendAnalyticsService = new NonAdSpendAnalyticsService();

/**
 * GET /api/analytics/non-ad-spend/:channel
 * Get campaign-level analytics for non-ad-spend (non-Meta/Google) channels
 */
router.get(
  '/non-ad-spend/:channel',
  authenticateUser,
  requireAnyRole,
  asyncHandler(async (req: AuthenticatedRequestWithRole, res: Response) => {
    try {
      // Parse and validate request
      const validationResult = nonAdSpendAnalyticsRequestSchema.safeParse({
        accountId: req.query.account_id,
        channel: req.params.channel,
        startDate: req.query.start_date,
        endDate: req.query.end_date,
        attributionModel: req.query.attribution_model,
        attributionWindow: req.query.attribution_window,
      });

      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request parameters',
          details: validationResult.error.errors,
        });
      }

      const params = validationResult.data;

      // Validate that it's a non-ad-spend channel using centralized config
      if (isAdSpendChannel(params.channel)) {
        return res.status(400).json({
          success: false,
          error: `Channel '${params.channel}' is an ad-spend channel. This endpoint is for non-ad-spend channels only.`,
        });
      }

      logger.info('Fetching non-ad-spend analytics', {
        userId: req.user?.id,
        params,
      });

      // Fetch analytics data
      const result = await nonAdSpendAnalyticsService.getCampaignAnalytics(params);

      return res.json(result);
    } catch (error) {
      logger.error('Error in non-ad-spend analytics endpoint', { error });

      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  })
);

export default router;
