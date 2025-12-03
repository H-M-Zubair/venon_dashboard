import { Router, Response } from 'express';
import { TimeseriesService } from '@/services/timeseries.js';
import { asyncHandler } from '@/middleware/error.js';
import { authenticateUser } from '@/middleware/auth.js';
import { requireAnyRole, AuthenticatedRequestWithRole } from '@/middleware/rbac.js';
import { timeseriesQuerySchema } from '@/types/timeseries.js';
import logger from '@/config/logger.js';

const router = Router();
const timeseriesService = new TimeseriesService();

/**
 * @route GET /api/timeseries
 * @desc Get timeseries data for ROAS and ad spend
 * @access Private
 * @query {string} account_id - The account ID
 * @query {string} start_date - Start date (YYYY-MM-DD)
 * @query {string} end_date - End date (YYYY-MM-DD)
 * @query {string} attribution_model - Attribution model
 * @query {string} attribution_window - Attribution window
 * @query {object} filter - Optional filter for channel or ad hierarchy
 */
router.get(
  '/',
  authenticateUser,
  requireAnyRole,
  asyncHandler(async (req: AuthenticatedRequestWithRole, res: Response): Promise<void> => {
    // Parse filter from query params if it's a JSON string
    const queryParams = { ...req.query };
    if (queryParams.filter && typeof queryParams.filter === 'string') {
      try {
        queryParams.filter = JSON.parse(queryParams.filter);
      } catch (e) {
        logger.error('Failed to parse filter JSON', { filter: queryParams.filter });
      }
    }

    // Validate the parsed query
    const validation = timeseriesQuerySchema.safeParse({ query: queryParams });

    if (!validation.success) {
      res.status(400).json({
        error: 'Invalid request parameters',
        details: validation.error.errors,
      });
      return;
    }

    const { query } = validation.data;

    logger.info('Timeseries request received', {
      accountId: query.account_id,
      startDate: query.start_date,
      endDate: query.end_date,
      filter: query.filter,
    });

    const result = await timeseriesService.getTimeseries(query.account_id, query);

    res.json(result);
  })
);

export default router;
