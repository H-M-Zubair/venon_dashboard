/**
 * Validation Utilities
 *
 * Common validation error handling utilities
 * to standardize error responses across routes.
 */

import { Response } from 'express';
import { z } from 'zod';
import logger from '@/config/logger.js';

/**
 * Formats Zod validation errors into a more readable structure
 *
 * @param errors - Array of Zod errors
 * @returns Formatted error array with field and message
 */
export function formatValidationErrors(errors: z.ZodIssue[]) {
  return errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}

/**
 * Handles validation errors by sending a standardized 400 response
 * Returns true if validation failed, false if succeeded
 *
 * @param validation - The SafeParseReturnType from Zod validation
 * @param res - Express Response object
 * @param context - Optional context for logging (e.g., endpoint name, accountId)
 * @returns true if validation failed (error sent), false if succeeded
 */
export function handleValidationError<T>(
  validation: z.SafeParseReturnType<any, T>,
  res: Response,
  context?: Record<string, any>
): validation is z.SafeParseError<any> {
  if (!validation.success) {
    const formattedErrors = formatValidationErrors(validation.error.errors);

    if (context) {
      logger.warn('Validation failed', { ...context, errors: formattedErrors });
    }

    res.status(400).json({
      success: false,
      error: 'Invalid request parameters',
      details: formattedErrors,
    });

    return true;
  }

  return false;
}

/**
 * Sends a standardized success response
 *
 * @param res - Express Response object
 * @param result - The result data to send
 * @param metadata - Optional metadata to include
 */
export function sendSuccessResponse(
  res: Response,
  result: any,
  metadata?: Record<string, any>
): void {
  res.json({
    success: true,
    result,
    ...(metadata && { metadata }),
  });
}

/**
 * Sends a standardized error response
 *
 * @param res - Express Response object
 * @param statusCode - HTTP status code
 * @param errorMessage - Error message
 * @param details - Optional additional error details
 */
export function sendErrorResponse(
  res: Response,
  statusCode: number,
  errorMessage: string,
  details?: any
): void {
  res.status(statusCode).json({
    success: false,
    error: errorMessage,
    ...(details && { details }),
  });
}
