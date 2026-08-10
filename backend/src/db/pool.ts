import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// `pg` returns NUMERIC as a string to avoid precision loss. Every numeric column
// in this schema is a money/quantity value that comfortably fits in a double, and
// the API contract exposes them as JSON numbers, so parse them here once.
types.setTypeParser(types.builtins.NUMERIC, (value: string) => Number.parseFloat(value));
// BIGINT (used only by COUNT(*)) — row counts never approach 2^53.
types.setTypeParser(types.builtins.INT8, (value: string) => Number.parseInt(value, 10));
// DATE columns are calendar dates with no timezone. The default parser builds a
// local-midnight Date, which can shift the day when serialised to JSON, so keep
// the raw 'YYYY-MM-DD' string instead.
types.setTypeParser(types.builtins.DATE, (value: string) => value);

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (error) => {
  logger.error('Unexpected PostgreSQL pool error', { message: error.message });
});

/** Run a single query on a pooled connection. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params as unknown[]);
}

/**
 * Run `fn` inside a single database transaction.
 *
 * Every statement issued through the supplied client is committed atomically;
 * any thrown error rolls the whole unit of work back. This is what guarantees
 * the challan rules: a confirmation either updates the challan, deducts stock
 * for *all* lines and writes *all* movement rows, or changes nothing at all.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Failed to roll back transaction', { rollbackError });
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

/** Anything that can run SQL: the pool itself or a transaction-bound client. */
export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}
