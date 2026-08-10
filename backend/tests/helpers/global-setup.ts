import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Runs once before the whole suite: rebuilds the test database schema from the
 * real migration files, so the tests always exercise the same DDL that ships.
 */
export default async function globalSetup(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? 'postgres://erp_user:erp_password@localhost:5433/erp_crm_test';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-value-for-integration-tests';
  process.env.BCRYPT_SALT_ROUNDS = '4';

  const { migrateReset } = await import('../../src/db/migrator');
  const { closePool } = await import('../../src/db/pool');

  await migrateReset();
  await closePool();
}
