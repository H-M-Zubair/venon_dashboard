import { Request, Response } from 'express';
import { CohortAnalyticsService } from '@/services/cohort-analytics.js';
import { cohortAnalyticsQuerySchema } from '@/types/cohort-analytics.js';
import logger from '@/config/logger.js';
import { AppError } from '@/middleware/error.js';

export class CohortAnalyticsController {
  private cohortAnalyticsService: CohortAnalyticsService;

  constructor() {
    this.cohortAnalyticsService = new CohortAnalyticsService();
  }

  getCohortAnalysis = async (req: Request & { user?: { id: string } }, res: Response) => {
    try {
      // Validate request
      const validation = cohortAnalyticsQuerySchema.safeParse({
        query: req.query,
      });

      if (!validation.success) {
        throw new AppError('Invalid query parameters', 400);
      }

      const { query } = validation.data;

      logger.info('Cohort analysis request', {
        shop_name: query.shop_name,
        cohort_type: query.cohort_type,
        start_date: query.start_date,
        end_date: query.end_date,
        user_id: req.user?.id,
      });

      // Get cohort analysis data
      const result = await this.cohortAnalyticsService.getCohortAnalysis(query);

      return res.json({
        success: true,
        result,
      });
    } catch (error) {
      logger.error('Error in cohort analysis controller', {
        error: error instanceof Error ? error.message : 'Unknown error',
        user_id: req.user?.id,
        query: req.query,
      });

      if (error instanceof AppError) {
        return res.status(error.statusCode).json({
          success: false,
          error: error.message,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Internal server error while fetching cohort analysis',
      });
    }
  };
}
