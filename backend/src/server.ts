import { createApp, API_PREFIX } from './app';
import { env } from './config/env';
import { closePool, pool } from './db/pool';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  // Fail fast with a clear message if the database is unreachable.
  try {
    await pool.query('SELECT 1');
    logger.info('Database connection established');
  } catch (error) {
    logger.error('Unable to connect to the database — check DATABASE_URL', {
      message: error instanceof Error ? error.message : error,
    });
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
    logger.info(`Base URL: http://localhost:${env.PORT}${API_PREFIX}`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await closePool().catch(() => undefined);
      process.exit(0);
    });
    // Do not hang forever on stuck connections.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason);
  });
}

void bootstrap();
