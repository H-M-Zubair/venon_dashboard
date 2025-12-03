import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import logger from '@/config/logger.js';

type RequestPart = 'body' | 'query' | 'params';

export const validateRequest =
  <T extends ZodSchema>(schema: T, part: RequestPart = 'body') =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = req[part];
      const result = schema.safeParse(data);

      if (!result.success) {
        const errors = result.error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        logger.warn('Request validation failed:', { errors, url: req.url });
        return res.status(400).json({
          error: 'Validation failed',
          details: errors,
        });
      }

      // Attach validated data to req
      req.validatedData = result.data;
      next();
    } catch (error) {
      logger.error('Validation middleware error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      validatedData?: any;
    }
  }
}
