import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { ApiError, type FieldIssue } from '../utils/api-error';

export function zodIssuesToFieldIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

type Source = 'body' | 'query' | 'params';

/**
 * Parse and REPLACE the given request section with the validated, coerced,
 * type-safe result. Downstream handlers therefore never see raw user input.
 */
function validate(source: Source, schema: ZodTypeAny): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const issues = zodIssuesToFieldIssues(result.error);
      next(
        ApiError.badRequest(
          `Invalid request ${source}: ${issues.map((i) => `${i.field} (${i.message})`).join('; ')}`,
          issues,
        ),
      );
      return;
    }
    // `req.query` is a getter-only property on Express 5; assigning to a local
    // validated store keeps both versions working.
    if (source === 'query') {
      (req as Request & { validatedQuery?: unknown }).validatedQuery = result.data;
    }
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}

export const validateBody = (schema: ZodTypeAny): RequestHandler => validate('body', schema);
export const validateQuery = (schema: ZodTypeAny): RequestHandler => validate('query', schema);
export const validateParams = (schema: ZodTypeAny): RequestHandler => validate('params', schema);
