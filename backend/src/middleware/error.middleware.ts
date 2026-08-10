import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { ApiError, ERROR_CODES } from '../utils/api-error';
import { logger } from '../utils/logger';
import { zodIssuesToFieldIssues } from './validate.middleware';

/** PostgreSQL error shape we care about (unique violation, check violation, ...). */
interface PgError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
}

function isPgError(error: unknown): error is PgError {
  return error instanceof Error && typeof (error as PgError).code === 'string';
}

/** Map a database constraint violation onto a meaningful API error. */
function translateDatabaseError(error: PgError): ApiError | null {
  switch (error.code) {
    case '23505': {
      // unique_violation
      const constraint = error.constraint ?? '';
      if (constraint.includes('products_sku')) {
        return ApiError.conflict(
          'A product with this SKU already exists.',
          ERROR_CODES.DUPLICATE_SKU,
        );
      }
      if (constraint.includes('users_email')) {
        return ApiError.conflict(
          'A user with this email already exists.',
          ERROR_CODES.DUPLICATE_EMAIL,
        );
      }
      if (constraint.includes('customers_gst_number')) {
        return ApiError.conflict('A customer with this GST number already exists.');
      }
      if (constraint.includes('challan_items_challan_product')) {
        return ApiError.conflict('The same product cannot be added to a challan twice.');
      }
      if (constraint.includes('challans_challan_number')) {
        return ApiError.conflict('Challan number collision, please retry.');
      }
      return ApiError.conflict('That record already exists.');
    }
    case '23503': // foreign_key_violation
      return ApiError.badRequest('A referenced record does not exist.');
    case '23514': {
      // check_violation — the stock guard is the one users can actually hit.
      if ((error.constraint ?? '').includes('current_stock')) {
        return ApiError.conflict(
          'This operation would make stock negative.',
          ERROR_CODES.INSUFFICIENT_STOCK,
        );
      }
      return ApiError.badRequest('A value violates a database constraint.');
    }
    case '22P02': // invalid_text_representation (e.g. malformed uuid/enum)
      return ApiError.badRequest('A value has an invalid format.');
    case '22003': // numeric_value_out_of_range
      return ApiError.badRequest('A numeric value is out of range.');
    default:
      return null;
  }
}

/** Terminal error handler. Every error in the app funnels through here. */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  // Express identifies error middleware by arity — `next` must stay declared.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  let apiError: ApiError;

  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof ZodError) {
    const issues = zodIssuesToFieldIssues(error);
    apiError = ApiError.badRequest('Validation failed.', issues);
  } else if (error instanceof SyntaxError && 'body' in error) {
    // express.json() rejects malformed payloads with a SyntaxError.
    apiError = new ApiError(400, ERROR_CODES.MALFORMED_JSON, 'Request body is not valid JSON.');
  } else if (isPgError(error)) {
    apiError = translateDatabaseError(error) ?? ApiError.internal();
    if (apiError.statusCode >= 500) {
      logger.error('Unhandled database error', {
        code: error.code,
        constraint: error.constraint,
        message: error.message,
        path: req.originalUrl,
      });
    }
  } else {
    apiError = ApiError.internal();
  }

  if (apiError.statusCode >= 500) {
    logger.error('Unhandled error', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    });
  } else {
    logger.debug(`${apiError.statusCode} ${apiError.code} on ${req.method} ${req.originalUrl}`, {
      message: apiError.message,
    });
  }

  const body: Record<string, unknown> = {
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
      ...(apiError.meta ? { meta: apiError.meta } : {}),
    },
    requestId: req.requestId,
  };

  // Stack traces are a local debugging aid only. Restricted to NODE_ENV=development
  // so neither production nor CI/test responses can echo internal details
  // (hostnames, credentials, file paths) back to a caller.
  if (env.isDevelopment && apiError.statusCode >= 500 && error instanceof Error) {
    (body.error as Record<string, unknown>).stack = error.stack;
  }

  res.status(apiError.statusCode).json(body);
}

/** 404 for unmatched routes, so clients always get the standard error envelope. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, ERROR_CODES.NOT_FOUND, `Route ${req.method} ${req.originalUrl} not found.`));
}
