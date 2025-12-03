/**
 * Event-Based Attribution Analytics Controller
 *
 * Handles HTTP requests for event-based attribution analytics with proper
 * authentication and authorization validation.
 */

import { Response } from 'express';
import { EventBasedAnalyticsService } from '@/services/event-based-analytics.js';
import {
  eventBasedChannelPerformanceQuerySchema,
  eventBasedPixelChannelQuerySchema,
} from '@/types/analytics.js';
import { AuthenticatedRequestWithRole } from '@/middleware/rbac.js';
import { AppError, asyncHandler } from '@/middleware/error.js';
import logger from '@/config/logger.js';

export class EventBasedAnalyticsController {
  private service: EventBasedAnalyticsService;

  constructor() {
    this.service = new EventBasedAnalyticsService();
  }

  /**
   * GET /api/event-analytics/channel-performance
   * Get channel-level performance using event-based attribution
   */
  getEventBasedChannelPerformance = asyncHandler(
    async (req: AuthenticatedRequestWithRole, res: Response): Promise<void> => {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      logger.info('Event-based channel performance request', {
        userId: req.user.id,
        role: req.user.role,
        shopName: req.user.shop_name,
      });

      // Validate request parameters
      const validation = eventBasedChannelPerformanceQuerySchema.safeParse({
        query: req.query,
      });

      if (!validation.success) {
        const errors = validation.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        logger.warn('Event-based channel performance request validation failed', {
          userId: req.user.id,
          shopName: req.user.shop_name,
          errors,
        });

        throw new AppError('Invalid request parameters', 400, true);
      }

      const { query: params } = validation.data;
      // RBAC middleware has already validated shop access via user_roles table
      // Get channel performance data using event-based attribution
      const result = await this.service.getEventBasedChannelPerformance(
        params.account_id,
        params
      );

      logger.info('Event-based channel performance data retrieved successfully', {
        accountId: params.account_id,
        shopName: result.metadata.shop_name,
        channelCount: result.data.length,
        attributionModel: params.attribution_model,
      });

      res.json({
        success: true,
        result,
      });
    }
  );

  /**
   * GET /api/event-analytics/pixel-channel-performance
   * Get pixel channel performance using event-based attribution
   * Returns ad hierarchy for paid channels, campaign list for non-paid channels
   */
  getEventBasedPixelChannelPerformance = asyncHandler(
    async (req: AuthenticatedRequestWithRole, res: Response): Promise<void> => {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      logger.info('Event-based pixel channel performance request', {
        userId: req.user.id,
        role: req.user.role,
        shopName: req.user.shop_name,
        channel: req.query.channel,
      });

      // Validate request parameters
      const validation = eventBasedPixelChannelQuerySchema.safeParse({
        query: req.query,
      });

      if (!validation.success) {
        const errors = validation.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        logger.warn('Event-based pixel channel performance request validation failed', {
          userId: req.user.id,
          shopName: req.user.shop_name,
          errors,
        });

        throw new AppError('Invalid request parameters', 400, true);
      }

      const { query: params } = validation.data;
      // RBAC middleware has already validated shop access via user_roles table
      // Get pixel channel performance data using event-based attribution
      const result = await this.service.getEventBasedPixelChannelPerformance(
        params.account_id,
        params
      );

      // Determine result type for logging
      const isAdHierarchy = 'total_ads' in result.metadata;

      logger.info('Event-based pixel channel performance data retrieved successfully', {
        accountId: params.account_id,
        channel: params.channel,
        shopName: result.metadata.shop_name,
        attributionModel: params.attribution_model,
        resultType: isAdHierarchy ? 'ad_hierarchy' : 'campaign_list',
        itemCount: isAdHierarchy
          ? (result.metadata as any).total_campaigns
          : result.metadata.total_campaigns,
      });

      res.json({
        success: true,
        result,
      });
    }
  );
}
