import { Request, Response, NextFunction } from 'express';
import logger from '@/config/logger.js';
import { env } from '@/config/environment.js';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class FacebookPermissionError extends AppError {
  constructor(message: string = 'Missing permissions for this operation. Please reconnect the Ad Account with an Admin Account') {
    super(message, 403, true);
  }
}

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let { message, statusCode } = error as AppError;

  if (!(error instanceof AppError)) {
    statusCode = 500;
    message = 'Internal server error';
  }

  logger.error('Error occurred:', {
    message: error.message,
    statusCode,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  const response: any = {
    error: message,
    statusCode,
  };

  if (env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const message = `Route ${req.originalUrl} not found`;
  logger.warn(message, { method: req.method, ip: req.ip });

  res.status(404).json({
    error: message,
    statusCode: 404,
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
