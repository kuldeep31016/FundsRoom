import { env } from '../config/env';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<Level | 'silent', number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function shouldLog(level: Level): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[env.LOG_LEVEL];
}

function emit(level: Level, message: string, context?: unknown): void {
  if (!shouldLog(level)) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(context !== undefined ? { context } : {}),
  };
  const serialised = env.isProduction ? JSON.stringify(line) : `[${level.toUpperCase()}] ${message}`;
  if (level === 'error') {
    console.error(serialised, env.isProduction ? '' : (context ?? ''));
  } else if (level === 'warn') {
    console.warn(serialised, env.isProduction ? '' : (context ?? ''));
  } else {
    console.log(serialised, env.isProduction ? '' : (context ?? ''));
  }
}

/**
 * Turn an unknown thrown value into something worth reading in a deploy log.
 *
 * Node reports a failed TCP connection as an `AggregateError` (one entry per
 * resolved address), and its `.message` is an empty string — so naively logging
 * `error.message` prints nothing at exactly the moment the operator needs the
 * reason. This unwraps aggregates, `cause` chains and error codes.
 */
export function describeError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    const parts = error.errors.map((inner) => describeError(inner));
    return [...new Set(parts)].join('; ');
  }

  if (error instanceof Error) {
    const code = (error as { code?: string }).code;
    const base = error.message || error.name;
    const withCode = code ? `${base} (${code})` : base;
    const cause = (error as { cause?: unknown }).cause;
    return cause ? `${withCode} — caused by: ${describeError(cause)}` : withCode;
  }

  return typeof error === 'string' ? error : JSON.stringify(error);
}

export const logger = {
  debug: (message: string, context?: unknown) => emit('debug', message, context),
  info: (message: string, context?: unknown) => emit('info', message, context),
  warn: (message: string, context?: unknown) => emit('warn', message, context),
  error: (message: string, context?: unknown) => emit('error', message, context),
};
