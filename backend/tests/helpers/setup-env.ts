import path from 'node:path';
import dotenv from 'dotenv';

// Loaded by Vitest before any application module is imported.
// dotenv never overwrites variables that are already set, so pointing
// DATABASE_URL at the test database here wins over backend/.env.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? 'silent';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://erp_user:erp_password@localhost:5433/erp_crm_test';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-value-for-integration-tests';
process.env.SEED_DEFAULT_PASSWORD = 'Password@123';
// Keep bcrypt cheap so the suite is not dominated by hashing.
process.env.BCRYPT_SALT_ROUNDS = '4';
