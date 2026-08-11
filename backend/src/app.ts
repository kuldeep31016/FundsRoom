import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { ApiError, ERROR_CODES } from './utils/api-error';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { requestContext, requestLogger } from './middleware/request-context.middleware';
import apiRoutes from './routes';

export const API_PREFIX = '/api/v1';

/**
 * Matches an origin against a CORS_ORIGINS entry, where `*` in the entry
 * stands for any run of characters. Lets one entry (e.g.
 * `https://funds-room-*-kuldeep31016s-projects.vercel.app`) cover every
 * per-deployment Vercel preview URL instead of needing a new exact match
 * added to Render each time a deployment gets a fresh URL.
 */
export function originMatchesPattern(origin: string, pattern: string): boolean {
  if (!pattern.includes('*')) return pattern === origin;
  const regex = new RegExp(
    `^${pattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  );
  return regex.test(origin);
}

export function createApp(): Express {
  const app = express();

  // Behind Render/Railway/Vercel proxies, trust the first hop so rate limiting
  // and logging see the real client IP.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(compression());

  app.use(
    cors({
      origin(origin, callback) {
        // Server-to-server calls (curl, Postman, health checks) send no Origin.
        if (!origin) return callback(null, true);
        if (
          env.corsOrigins.includes('*') ||
          env.corsOrigins.some((pattern) => originMatchesPattern(origin, pattern))
        ) {
          return callback(null, true);
        }
        // Rejected as an explicit 403 rather than a generic Error, which would
        // surface as a 500 with a stack trace. A misconfigured CORS_ORIGINS is
        // the most common deployment mistake, so the message names the fix.
        return callback(
          new ApiError(
            403,
            ERROR_CODES.FORBIDDEN,
            `Origin ${origin} is not allowed by CORS. Add it to the CORS_ORIGINS environment variable.`,
          ),
        );
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(requestContext);
  app.use(requestLogger);

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      skip: () => env.isTest,
      message: {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
      },
    }),
  );

  // Convenience root so hitting the bare service URL is self-explanatory.
  app.get('/', (_req, res) => {
    res.json({
      success: true,
      data: {
        name: 'Mini ERP + CRM Operations Portal API',
        version: '1.0.0',
        docs: `${API_PREFIX}/health`,
        apiPrefix: API_PREFIX,
      },
    });
  });

  app.use(API_PREFIX, apiRoutes);

  // 404 for anything unmatched, then the single terminal error handler.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
