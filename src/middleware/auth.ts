import { Request, Response, NextFunction } from 'express';
import { supabaseConnection } from '@/database/supabase/connection.js';
import logger from '@/config/logger.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    // Populated by RBAC middleware when used:
    role?: string;
    shop_name?: string;
  };
}

/**
 * Authentication Middleware
 *
 * Validates JWT token and identifies the user.
 * Does NOT perform authorization - use RBAC middleware for access control.
 *
 * Sets req.user with:
 * - id: User's UUID from Supabase auth
 * - email: User's email address
 *
 * For authorization (shop access, role validation), chain with RBAC middleware:
 * router.use(authenticateUser, requireRole(['admin', 'editor', 'viewer']))
 */
export const authenticateUser = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.substring(7);
    const supabase = supabaseConnection.getClient();

    // Validate JWT token with Supabase Auth
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn('Authentication failed', {
        error: error?.message,
        hasUser: !!user,
      });
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Set minimal authenticated user context
    // Authorization (shop access, roles) handled by RBAC middleware
    req.user = {
      id: user.id,
      email: user.email!,
    };

    logger.debug('User authenticated', {
      userId: user.id,
      email: user.email,
    });

    next();
  } catch (error) {
    logger.error('Authentication middleware error', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
};
