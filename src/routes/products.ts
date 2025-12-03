import { Router } from 'express';
import { ProductsController } from '@/controllers/products.js';
import { authenticateUser } from '@/middleware/auth.js';
import { requireAnyRole } from '@/middleware/rbac.js';
import rateLimit from 'express-rate-limit';

const router = Router();
const productsController = new ProductsController();

// Rate limiting for products endpoints
const productsRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per IP
  message: {
    error: 'Too many product requests, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply authentication and rate limiting to all product routes
router.use(productsRateLimit);
router.use(authenticateUser);
router.use(requireAnyRole); // All roles (viewer, editor, admin) can access

/**
 * GET /api/products
 *
 * Get all products with their variants for a specific shop
 *
 * Query Parameters:
 * - shop_name (string, required): The Shopify shop identifier
 *
 * Response:
 * {
 *   "success": true,
 *   "result": {
 *     "products": [
 *       {
 *         "id": "6883263348909",
 *         "name": "Gaming T-Shirt",
 *         "product_type": "Apparel",
 *         "shopify_shop": "gaming-klamotten",
 *         "variants": [
 *           {
 *             "id": "40593745191085",
 *             "title": "S / Black",
 *             "price": 29.99,
 *             "cost": 15.00,
 *             "shopify_product": "6883263348909"
 *           }
 *         ]
 *       }
 *     ],
 *     "metadata": {
 *       "shop_name": "gaming-klamotten",
 *       "total_products": 25,
 *       "total_variants": 150,
 *       "query_timestamp": "2025-09-18T07:00:00.000Z"
 *     }
 *   }
 * }
 */
router.get('/', productsController.getProducts);

export default router;
