import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError, ERROR_CODES } from '../utils/api-error';
import { roleHasPermission, type Permission, type Role } from '../config/permissions';
import { verifyAccessToken } from '../modules/auth/auth.service';

/**
 * Verifies the `Authorization: Bearer <jwt>` header and attaches `req.user`.
 * Responds 401 for a missing, malformed, invalid or expired token.
 */
export const authenticate: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;

  if (!header) {
    next(ApiError.unauthenticated('Authorization header is missing.'));
    return;
  }

  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    next(
      ApiError.unauthenticated(
        'Authorization header must use the "Bearer <token>" scheme.',
        ERROR_CODES.TOKEN_INVALID,
      ),
    );
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
    next();
  } catch (error) {
    next(error);
  }
};

/** Narrow `req.user` for handlers that run behind `authenticate`. */
export function requireUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) {
    // Programming error: a protected handler was mounted without `authenticate`.
    throw ApiError.unauthenticated();
  }
  return req.user;
}

/**
 * Authorization gate. This is the real security boundary — the frontend only
 * mirrors the same matrix to hide controls.
 */
export function requirePermission(...permissions: Permission[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(ApiError.unauthenticated());
      return;
    }
    const missing = permissions.filter(
      (permission) => !roleHasPermission(req.user!.role, permission),
    );
    if (missing.length > 0) {
      next(
        ApiError.forbidden(
          `Your role (${req.user.role}) is not permitted to perform this action. ` +
            `Required permission: ${missing.join(', ')}.`,
        ),
      );
      return;
    }
    next();
  };
}

/** Restrict a route to an explicit list of roles (used for user administration). */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(ApiError.unauthenticated());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(
        ApiError.forbidden(
          `This action requires one of the following roles: ${roles.join(', ')}.`,
        ),
      );
      return;
    }
    next();
  };
}
