import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticateUser, AuthenticatedRequest } from '@/middleware/auth.js';
import { requireEditor } from '@/middleware/rbac.js';
import { validateRequest } from '@/middleware/validation.js';
import { AdService } from '@/services/ads.js';
import { AdProvider } from '@/types/ads.js';
import logger from '@/config/logger.js';

const router = Router();

// Validation schemas
const statusUpdateSchema = z.object({
  body: z.object({
    enabled: z.boolean(),
    shop_name: z.string().optional(),
  }),
  params: z.object({
    provider: z.enum(['google', 'facebook']),
    campaignId: z.string().optional(),
    adSetId: z.string().optional(),
    adId: z.string().optional(),
  }),
  query: z.object({}).optional(),
});

const budgetUpdateSchema = z.object({
  body: z.object({
    budget: z.number().positive(),
    shop_name: z.string().optional(),
  }),
  params: z.object({
    provider: z.enum(['google', 'facebook']),
    campaignId: z.string().optional(),
    adSetId: z.string().optional(),
  }),
  query: z.object({}).optional(),
});

// ========================================
// CAMPAIGN ROUTES
// ========================================

/**
 * Update campaign status (enable/pause)
 * PATCH /api/ads/:provider/campaigns/:campaignId/status
 */
router.patch(
  '/:provider/campaigns/:campaignId/status',
  authenticateUser,
  requireEditor,
  validateRequest(statusUpdateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { provider, campaignId } = req.params;
      const { enabled } = req.body;

      logger.info('Campaign status update request', {
        provider,
        campaignId,
        enabled,
        userId: req.user!.id,
      });

      const updatedCampaign = await AdService.updateCampaignStatus(
        provider as AdProvider,
        campaignId!,
        enabled
      );

      logger.info('Campaign status updated successfully', {
        campaignId,
        newStatus: enabled,
      });

      res.json(updatedCampaign);
    } catch (error) {
      logger.error('Campaign status update error', {
        error,
        provider: req.params.provider,
        campaignId: req.params.campaignId,
        userId: req.user?.id,
      });
      next(error);
    }
  }
);

/**
 * Update campaign budget
 * PATCH /api/ads/:provider/campaigns/:campaignId/budget
 */
router.patch(
  '/:provider/campaigns/:campaignId/budget',
  authenticateUser,
  requireEditor,
  validateRequest(budgetUpdateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { provider, campaignId } = req.params;
      const { budget } = req.body;

      logger.info('Campaign budget update request', {
        provider,
        campaignId,
        budget,
        userId: req.user!.id,
      });

      const updatedCampaign = await AdService.updateCampaignBudget(
        provider as AdProvider,
        campaignId!,
        budget
      );

      logger.info('Campaign budget updated successfully', {
        campaignId,
        newBudget: budget,
      });

      res.json(updatedCampaign);
    } catch (error) {
      logger.error('Campaign budget update error', {
        error,
        provider: req.params.provider,
        campaignId: req.params.campaignId,
        userId: req.user?.id,
      });
      next(error);
    }
  }
);

// ========================================
// AD SET ROUTES
// ========================================

/**
 * Update ad set status (enable/pause)
 * PATCH /api/ads/:provider/ad-sets/:adSetId/status
 */
router.patch(
  '/:provider/ad-sets/:adSetId/status',
  authenticateUser,
  requireEditor,
  validateRequest(statusUpdateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { provider, adSetId } = req.params;
      const { enabled } = req.body;

      logger.info('Ad set status update request', {
        provider,
        adSetId,
        enabled,
        userId: req.user!.id,
      });

      const updatedAdSet = await AdService.updateAdSetStatus(
        provider as AdProvider,
        adSetId!,
        enabled
      );

      logger.info('Ad set status updated successfully', {
        adSetId,
        newStatus: enabled,
      });

      res.json(updatedAdSet);
    } catch (error) {
      logger.error('Ad set status update error', {
        error,
        provider: req.params.provider,
        adSetId: req.params.adSetId,
        userId: req.user?.id,
      });
      next(error);
    }
  }
);

/**
 * Update ad set budget
 * PATCH /api/ads/:provider/ad-sets/:adSetId/budget
 */
router.patch(
  '/:provider/ad-sets/:adSetId/budget',
  authenticateUser,
  requireEditor,
  validateRequest(budgetUpdateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { provider, adSetId } = req.params;
      const { budget } = req.body;

      logger.info('Ad set budget update request', {
        provider,
        adSetId,
        budget,
        userId: req.user!.id,
      });

      const updatedAdSet = await AdService.updateAdSetBudget(
        provider as AdProvider,
        adSetId!,
        budget
      );

      logger.info('Ad set budget updated successfully', {
        adSetId,
        newBudget: budget,
      });

      res.json(updatedAdSet);
    } catch (error) {
      logger.error('Ad set budget update error', {
        error,
        provider: req.params.provider,
        adSetId: req.params.adSetId,
        userId: req.user?.id,
      });
      next(error);
    }
  }
);

// ========================================
// AD ROUTES
// ========================================

/**
 * Update ad status (enable/pause)
 * PATCH /api/ads/:provider/ads/:adId/status
 */
router.patch(
  '/:provider/ads/:adId/status',
  authenticateUser,
  requireEditor,
  validateRequest(statusUpdateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { provider, adId } = req.params;
      const { enabled } = req.body;

      logger.info('Ad status update request', {
        provider,
        adId,
        enabled,
        userId: req.user!.id,
      });

      const updatedAd = await AdService.updateAdStatus(provider as AdProvider, adId!, enabled);

      logger.info('Ad status updated successfully', {
        adId,
        newStatus: enabled,
      });

      res.json(updatedAd);
    } catch (error) {
      logger.error('Ad status update error', {
        error,
        provider: req.params.provider,
        adId: req.params.adId,
        userId: req.user?.id,
      });
      next(error);
    }
  }
);

/**
 * Update ad budget (not supported - will return error)
 * PATCH /api/ads/:provider/ads/:adId/budget
 */
router.patch(
  '/:provider/ads/:adId/budget',
  authenticateUser,
  requireEditor,
  validateRequest(budgetUpdateSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { provider, adId } = req.params;
      const { budget } = req.body;

      // This will throw an error since individual ads don't have budgets
      await AdService.updateAdBudget(provider as AdProvider, adId!, budget);

      res.json({ success: true });
    } catch (error) {
      logger.error('Ad budget update error', {
        error,
        provider: req.params.provider,
        adId: req.params.adId,
        userId: req.user?.id,
      });
      next(error);
    }
  }
);

export default router;
