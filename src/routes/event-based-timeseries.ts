import { Router, Response } from 'express';
import { EventBasedTimeseriesService } from '@/services/event-based-timeseries.js';
import { asyncHandler } from '@/middleware/error.js';
import { authenticateUser } from '@/middleware/auth.js';
import { requireAnyRole, AuthenticatedRequestWithRole } from '@/middleware/rbac.js';
import { eventBasedTimeseriesQuerySchema } from '@/types/timeseries.js';
import logger from '@/config/logger.js';
import { handleValidationError } from '@/utils/validation-helpers.js';

const router = Router();
const eventBasedTimeseriesService = new EventBasedTimeseriesService();

/**
 * @route GET /api/event-analytics/timeseries
 * @desc Get event-based timeseries data for ROAS and ad spend
 * @access Private
 * @query {string} account_id - The account ID
 * @query {string} start_date - Start date (YYYY-MM-DD)
 * @query {string} end_date - End date (YYYY-MM-DD)
 * @query {string} attribution_model - Attribution model (first_click, last_click, etc.)
 * @query {object} filter - Optional filter for channel or ad hierarchy
 *
 * NOTE: Unlike order-based timeseries, this does NOT require attribution_window parameter
 * Event-based attribution is always lifetime (uses event_timestamp filtering only)
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
    const validation = eventBasedTimeseriesQuerySchema.safeParse({ query: queryParams });

    if (handleValidationError(validation, res, {
      accountId: queryParams.account_id,
      endpoint: 'event-based-timeseries',
    })) {
      return;
    }

    const { query } = validation.data;

    logger.info('Event-based timeseries request received', {
      accountId: query.account_id,
      startDate: query.start_date,
      endDate: query.end_date,
      attributionModel: query.attribution_model,
      filter: query.filter,
    });

    const result = await eventBasedTimeseriesService.getEventBasedTimeseries(
      query.account_id,
      query
    );

    res.json(result);
  })
);

export default router;
