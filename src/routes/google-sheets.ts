import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticateUser, AuthenticatedRequest } from '@/middleware/auth.js';
import { requireEditor } from '@/middleware/rbac.js';
import { validateRequest } from '@/middleware/validation.js';
import { googleSheetsService } from '@/services/google-sheets.js';
import { supabaseConnection } from '@/database/supabase/connection.js';
import logger from '@/config/logger.js';
import { AppError } from '@/middleware/error.js';
import {
  createExportConfigSchema,
  exportIdParamSchema,
  updateExportConfigSchema,
} from '../validators/google-sheets.js';
import { google } from 'googleapis';
import { sheets } from 'googleapis/build/src/apis/sheets';
import { GoogleSheetsExportService } from '@/services/google-sheets-export.js';

const router = Router();

// ============================================================================
// ACCOUNT MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * List connected Google accounts
 * GET /api/google-sheets/accounts
 */

router.get(
  '/accounts',
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const response = await googleSheetsService.getIntegrationsWithExports(req.user!.id);
      res.json({ data: response });
    } catch (error) {
      logger.error('Get accounts error:', error);
      next(error);
    }
  }
);

/**
 * Disconnect Google account
 * DELETE /api/google-sheets/accounts/:integration_id
 */
router.delete(
  '/accounts/:integration_id',
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const integrationId = req.params.integration_id;
      if (!integrationId) {
        throw new AppError('Integration ID is required', 400);
      }
      const response = await googleSheetsService.disconnectAccount(integrationId);
      res.json({ message: 'Google account disconnected successfully' });
    } catch (error) {
      logger.error('Disconnect account error:', error);
      next(error);
    }
  }
);

router.post(
  '/exports',
  authenticateUser,
  requireEditor,
  validateRequest(createExportConfigSchema, 'body'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      console.log('req.body', req.body, 'USER IS', req.user);
      const response = await googleSheetsService.exportDataToSheet(
        req.body,
        (req.user!.id as string) || ''
      );
      res.status(201).json({ data: response });
    } catch (error) {
      logger.error('Create export configuration error:', error);
      next(error);
    }
  }
);

/**
 * List export configurations
 * GET /api/google-sheets/exports
 */
router.get(
  '/exports',
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { active, sync_frequency, page, page_size } = req.query;

      if (!active || !sync_frequency) {
        throw new AppError('active and sync_frequency query parameters are required', 400);
      }
      const response = await googleSheetsService.getExportsSheets(
        active.toString(),
        sync_frequency.toString(),
        req.user!.id,
        page ? Number(page) : 1,
        page_size ? Number(page_size) : 10
      );
      res.json({ data: response });
    } catch (error) {
      logger.error('List exports error:', error);
      next(error);
    }
  }
);

/**
 * Get single export configuration
 * GET /api/google-sheets/exports/:id
 */
router.get(
  '/exports/:id',
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new AppError('Export ID is required', 400);
      }
      const response = await googleSheetsService.getExportSheetById(id, req.user!.id);
      res.json({ data: response });
    } catch (error) {
      logger.error('Get export configuration error:', error);
      next(error);
    }
  }
);

/**
 * Update export configuration
 * PUT /api/google-sheets/exports/:id
 */
router.put(
  '/exports/:id',
  authenticateUser,
  requireEditor,
  validateRequest(updateExportConfigSchema, 'body'),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const updated = await googleSheetsService.updateExportConfig(
        req.params.id as string,
        req.body,
        req.user!.id
      );
      res.json({ data: updated });
    } catch (error) {
      logger.error('Update export configuration error:', error);
      next(error);
    }
  }
);

/**
 * Delete export configuration
 * DELETE /api/google-sheets/exports/:id
 */
router.delete(
  '/exports/:id',
  authenticateUser,
  requireEditor,
  validateRequest(z.object({ params: exportIdParamSchema })),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      if (!id) {
        throw new AppError('Export ID is required', 400);
      }
      await googleSheetsService.deleteExportConfig(id, req.user!.id);
      res.json({ message: 'Export configuration deleted successfully' });
    } catch (error) {
      logger.error('Delete export configuration error:', error);
      next(error);
    }
  }
);

/**
 * Get export logs
 * GET /api/google-sheets/exports/:id/logs
 */
router.get(
  '/exports/:id/logs',
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { limit = '30', status } = req.query;

      if (!id) {
        throw new AppError('Export ID is required', 400);
      }
      const response = await googleSheetsService.getExportLogs(
        id,
        req.user!.id,
        parseInt(limit as string, 10),
        status as string | undefined
      );
      res.json({ data: response });
    } catch (error) {
      logger.error('Get export logs error:', error);
      next(error);
    }
  }
);

export default router;
