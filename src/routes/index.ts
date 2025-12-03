import { Router } from 'express';
import analyticsRoutes from './analytics';
import timeseriesRoutes from './timeseries';
import nonAdSpendAnalyticsRoutes from './non-ad-spend-analytics';
import ordersAttributionRoutes from './orders-attribution';
import eventBasedAnalyticsRoutes from './event-based-analytics';
import orderEventsRoutes from './order-events';
import ordersRoutes from './orders';
import usersRoutes from './users';
import productsRoutes from './products';
import adsRoutes from './ads';
import shopifyRoutes from './shopify';
import { checkThemeSetup } from '@/controllers/check-theme-setup';
import { authenticateUser } from '@/middleware/auth';
import { requireAnyRole } from '@/middleware/rbac';
import googleSheetsRoutes from './google-sheets';
import auth from './auth';
const router = Router();

// Mount analytics routes
router.use('/analytics', analyticsRoutes);

// Mount timeseries routes
router.use('/timeseries', timeseriesRoutes);

// Mount non-ad-spend analytics routes (nested under analytics)
router.use('/analytics', nonAdSpendAnalyticsRoutes);

// Mount orders attribution routes (nested under analytics)
router.use('/analytics', ordersAttributionRoutes);

// Mount event-based analytics routes (nested under event-analytics)
router.use('/event-analytics', eventBasedAnalyticsRoutes);

// Mount order events routes
router.use('/', orderEventsRoutes);

// Mount orders routes
router.use('/orders', ordersRoutes);

// Mount users routes
router.use('/users', usersRoutes);

// Mount products routes
router.use('/products', productsRoutes);

// Mount ads routes
router.use('/ads', adsRoutes);

// Mount Shopify routes
router.use('/shopify', shopifyRoutes);

// Mount Google Sheets routes
router.use('/google-sheets', googleSheetsRoutes);

router.use('/auth', auth);
// Health check for API routes
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'API routes are healthy',
    timestamp: new Date().toISOString(),
  });
});

router.get('/checkThemeSetup', authenticateUser, requireAnyRole, checkThemeSetup);

export default router;
