/**
 * Event-Based Attribution Analytics API Routes
 *
 * Provides REST endpoints for event-based attribution analytics
 * with authentication, authorization, and rate limiting
 */

import { Router } from 'express';
import { EventBasedAnalyticsController } from '@/controllers/event-based-analytics.js';
import { authenticateUser } from '@/middleware/auth.js';
import { requireAnyRole } from '@/middleware/rbac.js';
import rateLimit from 'express-rate-limit';
import eventBasedOrdersAttributionRouter from './event-based-orders-attribution.js';
import eventBasedTimeseriesRouter from './event-based-timeseries.js';

const router = Router();
const controller = new EventBasedAnalyticsController();

// Rate limiting for event-based analytics endpoints
const analyticsRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: {
    error: 'Too many analytics requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply security middleware to all event-based analytics routes
router.use(analyticsRateLimit);
router.use(authenticateUser);
router.use(requireAnyRole); // All roles can view analytics

/**
 * GET /api/event-analytics/channel-performance
 *
 * Get channel-level performance using event-based attribution
 *
 * Query Parameters:
 * - account_id: string (required)
 * - start_date: string (YYYY-MM-DD format, required)
 * - end_date: string (YYYY-MM-DD format, required)
 * - attribution_model: 'first_click' | 'last_click' | 'last_paid_click' | 'linear_all' | 'linear_paid'
 *
 * Returns:
 * - Channel-level metrics aggregated by attribution model
 * - No attribution window (uses event timestamps directly)
 *
 * Security:
 * - Requires authentication (JWT token)
 * - Validates user has access to requested account
 * - Rate limited to 30 requests/minute
 */
router.get('/channel-performance', controller.getEventBasedChannelPerformance);

/**
 * GET /api/event-analytics/pixel-channel-performance
 *
 * Get pixel channel performance using event-based attribution
 * - For paid channels (meta-ads, google-ads, etc.): Returns ad hierarchy (campaigns -> ad sets -> ads)
 * - For non-paid channels (organic, direct, etc.): Returns campaign list
 *
 * Query Parameters:
 * - account_id: string (required)
 * - channel: string (required)
 * - start_date: string (YYYY-MM-DD format, required)
 * - end_date: string (YYYY-MM-DD format, required)
 * - attribution_model: 'first_click' | 'last_click' | 'last_paid_click' | 'linear_all' | 'linear_paid'
 *
 * Returns:
 * - Ad-level hierarchy for paid channels
 * - Campaign list for non-paid channels
 *
 * Security:
 * - Requires authentication (JWT token)
 * - Validates user has access to requested account
 * - Rate limited to 30 requests/minute
 */
router.get('/pixel-channel-performance', controller.getEventBasedPixelChannelPerformance);

/**
 * Event-Based Orders Attribution Routes
 *
 * Mount the orders attribution sub-router
 * This provides endpoints for retrieving order lists based on event-based attribution
 *
 * Endpoints:
 * - GET /api/event-analytics/orders-attribution
 *
 * Security is handled within the orders attribution router
 */
router.use('/', eventBasedOrdersAttributionRouter);

/**
 * Event-Based Timeseries Routes
 *
 * Mount the timeseries sub-router
 * This provides endpoints for retrieving time-aggregated (hourly/daily) ROAS, ad spend,
 * and attributed revenue using event-based attribution
 *
 * Endpoints:
 * - GET /api/event-analytics/timeseries
 *
 * Security is handled within the timeseries router
 */
router.use('/timeseries', eventBasedTimeseriesRouter);

export default router;
