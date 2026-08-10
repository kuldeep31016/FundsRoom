import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/** Attach a correlation id to every request and echo it back to the client. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  req.requestId = typeof incoming === 'string' && incoming ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

/** Minimal structured access log. Silent during tests to keep output readable. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (env.isTest) {
    next();
    return;
  }
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`, {
      requestId: req.requestId,
      userId: req.user?.id,
    });
  });
  next();
}
