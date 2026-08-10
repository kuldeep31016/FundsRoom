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

export const logger = {
  debug: (message: string, context?: unknown) => emit('debug', message, context),
  info: (message: string, context?: unknown) => emit('info', message, context),
  warn: (message: string, context?: unknown) => emit('warn', message, context),
  error: (message: string, context?: unknown) => emit('error', message, context),
};
