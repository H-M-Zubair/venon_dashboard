import { Router } from 'express';
import { OrdersController } from '@/controllers/orders.js';
import { authenticateUser } from '@/middleware/auth.js';
import { requireAnyRole } from '@/middleware/rbac.js';
import rateLimit from 'express-rate-limit';

const router = Router();
const ordersController = new OrdersController();

// Rate limiting for orders endpoints
const ordersRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: {
    error: 'Too many orders requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication and rate limiting to all orders routes
router.use(ordersRateLimit);
router.use(authenticateUser);
router.use(requireAnyRole); // All roles can view orders

/**
 * GET /api/orders/shopify
 *
 * Get recent Shopify orders for a shop with attribution sources
 *
 * Query Parameters:
 * - shop_name (string, required): The Shopify shop name (e.g., "gaming-klamotten")
 * - start_date (string, required): Start date in YYYY-MM-DD format
 * - end_date (string, required): End date in YYYY-MM-DD format
 *
 * Response:
 * {
 *   "success": true,
 *   "orders": [
 *     {
 *       "id": "5643215789",
 *       "name": "#1234",
 *       "customerFirstName": "John",
 *       "customerLastName": "Doe",
 *       "time": "14:35",
 *       "totalPrice": 129.99,
 *       "sources": ["google", "facebook"]
 *     }
 *   ],
 *   "metadata": {
 *     "shop_name": "gaming-klamotten",
 *     "start_date": "2025-06-01",
 *     "end_date": "2025-06-30",
 *     "timezone": "Europe/Berlin",
 *     "total_orders": 10,
 *     "query_timestamp": "2025-08-28T10:30:00.000Z"
 *   }
 * }
 *
 * Note: Returns the 10 most recent orders within the date range
 * Access: Users must either own the shop or have a role (viewer, editor, admin) for the shop
 */
router.get('/shopify', ordersController.getShopifyOrders);

export default router;
