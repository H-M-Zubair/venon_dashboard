import { Request, Response } from 'express';
import { AnalyticsService } from '@/services/analytics.js';
import {
  channelPerformanceQuerySchema,
  pixelChannelQuerySchema,
  dashboardMetricsQuerySchema,
} from '@/types/analytics.js';
import { AuthenticatedRequestWithRole } from '@/middleware/rbac.js';
import { AppError, asyncHandler } from '@/middleware/error.js';
import logger from '@/config/logger.js';

export class AnalyticsController {
  private analyticsService: AnalyticsService;

  constructor() {
    this.analyticsService = new AnalyticsService();
  }

  getChannelPerformance = asyncHandler(
    async (req: AuthenticatedRequestWithRole, res: Response): Promise<void> => {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      // Log the user's role for this request
      logger.info('Channel performance request', {
        userId: req.user.id,
        role: req.user.role,
        shopName: req.user.shop_name,
      });

      // Validate request parameters
      const validation = channelPerformanceQuerySchema.safeParse({
        query: req.query,
      });

      if (!validation.success) {
        const errors = validation.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        logger.warn('Channel performance request validation failed', {
          userId: req.user.id,
          shopName: req.user.shop_name,
          errors,
        });

        throw new AppError('Invalid request parameters', 400, true);
      }

      const { query: params } = validation.data;

      // RBAC middleware has already validated shop access via user_roles table
      // Get channel performance data
      const result = await this.analyticsService.getChannelPerformance(params.account_id, params);

      logger.info('Channel performance data retrieved successfully', {
        accountId: params.account_id,
        shopName: result.metadata.shop_name,
        channelCount: result.data.length,
      });

      res.json({
        success: true,
        result,
      });
    }
  );

  getChannelPerformanceSummary = asyncHandler(
    async (req: AuthenticatedRequestWithRole, res: Response): Promise<void> => {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      // Role is already validated by middleware, just log it
      logger.info('Channel performance summary request', {
        userId: req.user.id,
        role: req.user.role,
        shopName: req.user.shop_name,
      });

      const validation = channelPerformanceQuerySchema.safeParse({
        query: req.query,
      });

      if (!validation.success) {
        throw new AppError('Invalid request parameters', 400);
      }

      const { query: params } = validation.data;
      // RBAC middleware has already validated shop access via user_roles table
      const result = await this.analyticsService.getChannelPerformance(params.account_id, params);

      // Calculate summary metrics
      const summary = result.data.reduce(
        (acc, channel) => ({
          total_attributed_revenue: acc.total_attributed_revenue + channel.attributed_revenue,
          total_attributed_orders: acc.total_attributed_orders + channel.attributed_orders,
          total_ad_spend: acc.total_ad_spend + channel.ad_spend,
          total_net_profit: acc.total_net_profit + channel.net_profit,
          total_attributed_cogs: acc.total_attributed_cogs + channel.attributed_cogs,
        }),
        {
          total_attributed_revenue: 0,
          total_attributed_orders: 0,
          total_ad_spend: 0,
          total_net_profit: 0,
          total_attributed_cogs: 0,
        }
      );

      const overallRoas =
        summary.total_ad_spend > 0 ? summary.total_attributed_revenue / summary.total_ad_spend : 0;

      res.json({
        success: true,
        result: {
          ...summary,
          overall_roas: overallRoas,
          channel_count: result.data.length,
          metadata: result.metadata,
        },
      });
    }
  );

  getPixelChannelPerformance = asyncHandler(
    async (req: AuthenticatedRequestWithRole, res: Response): Promise<void> => {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      logger.info('Pixel channel performance request', {
        userId: req.user.id,
        role: req.user.role,
        shopName: req.user.shop_name,
        channel: req.params.channel,
      });

      // Validate request parameters
      const validation = pixelChannelQuerySchema.safeParse({
        query: {
          ...req.query,
          channel: req.params.channel,
        },
      });

      if (!validation.success) {
        const errors = validation.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        logger.warn('Pixel channel performance request validation failed', {
          userId: req.user.id,
          shopName: req.user.shop_name,
          channel: req.params.channel,
          errors,
        });

        throw new AppError('Invalid request parameters', 400, true);
      }

      const { query: params } = validation.data;
      // RBAC middleware has already validated shop access via user_roles table
      // Get pixel channel performance data
      const result = await this.analyticsService.getPixelChannelPerformance(
        params.account_id,
        params
      );

      logger.info('Pixel channel performance data retrieved successfully', {
        accountId: params.account_id,
        channel: params.channel,
        shopName: result.metadata.shop_name,
        campaignCount: result.data.length,
        totalAds: result.metadata.total_ads,
      });

      res.json({
        success: true,
        result,
      });
    }
  );

  getDashboardMetrics = asyncHandler(
    async (req: AuthenticatedRequestWithRole, res: Response): Promise<void> => {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      logger.info('Dashboard metrics request', {
        userId: req.user.id,
        role: req.user.role,
        shopName: req.user.shop_name,
      });

      // Validate request parameters
      const validation = dashboardMetricsQuerySchema.safeParse({
        query: req.query,
      });

      if (!validation.success) {
        const errors = validation.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        logger.warn('Dashboard metrics request validation failed', {
          userId: req.user.id,
          shopName: req.user.shop_name,
          errors,
        });

        throw new AppError('Invalid request parameters', 400, true);
      }

      const { query: params } = validation.data;
      // RBAC middleware has already validated shop access via user_roles table
      // Get dashboard metrics data
      const result = await this.analyticsService.getDashboardMetrics(params.account_id, params);

      logger.info('Dashboard metrics data retrieved successfully', {
        accountId: params.account_id,
        shopName: result.metadata.shop_name,
        dataPoints: result.data.timeseries.length,
        aggregationLevel: result.data.aggregation_level,
      });

      res.json({
        success: true,
        result,
      });
    }
  );
}
