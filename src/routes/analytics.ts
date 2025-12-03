import { Router } from 'express';
import { AnalyticsController } from '@/controllers/analytics.js';
import { CohortAnalyticsController } from '@/controllers/cohort-analytics.js';
import { authenticateUser } from '@/middleware/auth.js';
import { requireAnyRole } from '@/middleware/rbac.js';
import rateLimit from 'express-rate-limit';

const router = Router();
const analyticsController = new AnalyticsController();
const cohortAnalyticsController = new CohortAnalyticsController();

// Rate limiting for analytics endpoints
const analyticsRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: {
    error: 'Too many analytics requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication and rate limiting to all analytics routes
router.use(analyticsRateLimit);
router.use(authenticateUser);
router.use(requireAnyRole); // All roles can view analytics

/**
 * GET /api/analytics/channel-performance
 *
 * Get detailed channel performance metrics with attribution data
 *
 * Query Parameters:
 * - shop_name (string, required): The Shopify shop identifier
 * - start_date (string, required): Start date in YYYY-MM-DD format
 * - end_date (string, required): End date in YYYY-MM-DD format
 * - attribution_model (string, optional): 'linear_paid', 'first_click', 'last_click' (default: 'linear_paid')
 * - attribution_window (string, optional): '1_day', '7_day', '14_day', '28_day' (default: '28_day')
 *
 * Response:
 * {
 *   "success": true,
 *   "result": {
 *     "data": [
 *       {
 *         "channel": "facebook",
 *         "attributed_orders": 15.5,
 *         "attributed_revenue": 2340.50,
 *         "distinct_orders_touched": 23,
 *         "attributed_cogs": 1200.30,
 *         "attributed_payment_fees": 45.20,
 *         "attributed_tax": 187.24,
 *         "ad_spend": 450.00,
 *         "roas": 5.20,
 *         "net_profit": 457.76
 *       }
 *     ],
 *     "metadata": {
 *       "shop_name": "gaming-klamotten",
 *       "start_date": "2025-06-01",
 *       "end_date": "2025-07-01",
 *       "attribution_model": "linear_paid",
 *       "attribution_window": "28_day",
 *       "total_channels": 5,
 *       "query_timestamp": "2025-07-15T05:45:30.123Z"
 *     }
 *   }
 * }
 */
router.get('/channel-performance', analyticsController.getChannelPerformance);

/**
 * GET /api/analytics/channel-performance/summary
 *
 * Get aggregated summary of channel performance metrics
 *
 * Query Parameters: Same as /channel-performance
 *
 * Response:
 * {
 *   "success": true,
 *   "result": {
 *     "total_attributed_revenue": 15000.00,
 *     "total_attributed_orders": 150.5,
 *     "total_ad_spend": 3500.00,
 *     "total_net_profit": 8245.30,
 *     "total_attributed_cogs": 7500.00,
 *     "overall_roas": 4.29,
 *     "channel_count": 5,
 *     "metadata": { ... }
 *   }
 * }
 */
router.get('/channel-performance/summary', analyticsController.getChannelPerformanceSummary);

/**
 * GET /api/analytics/pixel/:channel
 *
 * Get detailed pixel/campaign performance data for a specific channel
 * Includes hierarchical data: campaigns -> ad sets -> ads with performance metrics
 *
 * Path Parameters:
 * - channel (string, required): The advertising channel (e.g., 'google-ads', 'meta-ads')
 *
 * Query Parameters:
 * - account_id (string, required): The account identifier
 * - start_date (string, required): Start date in YYYY-MM-DD format
 * - end_date (string, required): End date in YYYY-MM-DD format
 * - attribution_model (string, optional): Attribution model to use (default: 'last_paid_click')
 * - attribution_window (string, optional): Attribution window (default: '28_day')
 *
 * Response:
 * {
 *   "success": true,
 *   "result": {
 *     "data": [
 *       {
 *         "id": 188294,
 *         "platform_ad_campaign_id": "21588839685",
 *         "name": "Campaign Name",
 *         "active": true,
 *         "budget": 1000.00,
 *         "ad_sets": [
 *           {
 *             "id": 776420,
 *             "platform_ad_set_id": "21588839685",
 *             "name": "Ad Set Name",
 *             "active": true,
 *             "budget": 500.00,
 *             "ads": [
 *               {
 *                 "id": 1039721,
 *                 "platform_ad_id": "21588839685",
 *                 "name": "Ad Name",
 *                 "active": true,
 *                 "image_url": "https://...",
 *                 "attributed_orders": 155.0,
 *                 "attributed_revenue": 6299.23,
 *                 // ... other metrics
 *               }
 *             ],
 *             // ... aggregated ad set metrics
 *           }
 *         ],
 *         // ... aggregated campaign metrics
 *       }
 *     ],
 *     "metadata": {
 *       "channel": "google-ads",
 *       "shop_name": "gaming-klamotten",
 *       "start_date": "2024-12-01",
 *       "end_date": "2025-07-01",
 *       "attribution_model": "last_paid_click",
 *       "attribution_window": "28_day",
 *       "total_campaigns": 5,
 *       "total_ad_sets": 12,
 *       "total_ads": 45,
 *       "query_timestamp": "2025-07-15T05:45:30.123Z"
 *     }
 *   }
 * }
 */
router.get('/pixel/:channel', analyticsController.getPixelChannelPerformance);

/**
 * GET /api/analytics/dashboard-metrics
 *
 * Get dashboard metrics with timeseries data for orders, revenue, costs, and profit
 * Automatically selects hourly aggregation for single day, daily for multiple days
 *
 * Query Parameters:
 * - account_id (string, required): The account identifier
 * - start_date (string, required): Start date in YYYY-MM-DD format
 * - end_date (string, required): End date in YYYY-MM-DD format
 *
 * Response:
 * {
 *   "success": true,
 *   "result": {
 *     "data": {
 *       "timeseries": [
 *         {
 *           "timestamp": "2025-07-01T00:00:00",
 *           "total_orders": 25,
 *           "total_revenue": 3500.00,
 *           "total_refunds": 150.00,
 *           "total_cogs": 1200.00,
 *           "total_ad_spend": 450.00,
 *           "profit": 1500.00
 *         }
 *       ],
 *       "aggregation_level": "daily" // or "hourly"
 *     },
 *     "metadata": {
 *       "shop_name": "gaming-klamotten",
 *       "start_date": "2025-07-01",
 *       "end_date": "2025-07-15",
 *       "query_timestamp": "2025-07-15T05:45:30.123Z"
 *     }
 *   }
 * }
 */
router.get('/dashboard-metrics', analyticsController.getDashboardMetrics);

/**
 * GET /api/analytics/cohort
 *
 * Get cohort analysis data with retention and revenue metrics
 *
 * Query Parameters:
 * - shop_name (string, required): The Shopify shop identifier
 * - start_date (string, required): Start date for cohorts in YYYY-MM-DD format
 * - end_date (string, optional): End date for cohorts in YYYY-MM-DD format (defaults to current date)
 * - cohort_type (string, required): 'week', 'month', 'quarter', or 'year'
 * - max_periods (number, optional): Maximum periods to track (defaults based on cohort_type)
 * - filter_product_id (number, optional): Filter by first order product ID
 * - filter_variant_id (number, optional): Filter by first order variant ID
 * - metrics (array, optional): Specific metrics to include in response
 *
 * Response:
 * {
 *   "success": true,
 *   "result": {
 *     "data": {
 *       "cohorts": [
 *         {
 *           "cohort": "2025-08-25",
 *           "cohort_size": 4,
 *           "cohort_ad_spend": 32.83,
 *           "cac_per_customer": 8.21,
 *           "periods": [
 *             {
 *               "period": 0,
 *               "metrics": {
 *                 "incremental": {
 *                   "active_customers": 4,
 *                   "active_customers_percentage": 100,
 *                   "orders": 4,
 *                   "net_revenue": 138.64,
 *                   "contribution_margin_one": 73.64,
 *                   "contribution_margin_three": 40.81,
 *                   "average_order_value": 36.65
 *                 },
 *                 "cumulative": {
 *                   "active_customers": 4,
 *                   "active_customers_percentage": 100,
 *                   "orders": 4,
 *                   "net_revenue": 138.64,
 *                   "contribution_margin_one": 73.64,
 *                   "contribution_margin_three": 40.81,
 *                   "average_order_value": 36.65,
 *                   "ltv_to_date": 36.65,
 *                   "net_ltv_to_date": 34.66,
 *                   "ltv_to_cac_ratio": 4.46,
 *                   "net_ltv_to_cac_ratio": 4.22,
 *                   "is_payback_achieved": true,
 *                   "cumulative_contribution_margin_three_per_customer": 10.20
 *                 }
 *               }
 *             }
 *           ]
 *         }
 *       ]
 *     },
 *     "metadata": {
 *       "shop_name": "gaming-klamotten",
 *       "cohort_type": "week",
 *       "start_date": "2025-06-30",
 *       "end_date": "2025-08-31",
 *       "max_periods": 52,
 *       "query_timestamp": "2025-09-18T..."
 *     }
 *   }
 * }
 */
router.get('/cohort', cohortAnalyticsController.getCohortAnalysis);

export default router;
