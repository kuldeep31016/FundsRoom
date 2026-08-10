import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pool, withTransaction } from './pool';
import { logger } from '../utils/logger';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  name: string;
  checksum: string;
  applied_at: Date;
}

function checksum(contents: string): string {
  return crypto.createHash('sha256').update(contents).digest('hex').slice(0, 32);
}

export function readMigrationFiles(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`Migrations directory not found: ${dir}`);
  }
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort() // filenames are zero-padded, so lexical order === execution order
    .map((name) => {
      const sql = fs.readFileSync(path.join(dir, name), 'utf8');
      return { name, sql, checksum: checksum(sql) };
    });
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      checksum   text        NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function getAppliedMigrations(): Promise<AppliedMigration[]> {
  await ensureMigrationsTable();
  const { rows } = await pool.query<AppliedMigration>(
    'SELECT name, checksum, applied_at FROM schema_migrations ORDER BY name',
  );
  return rows;
}

/**
 * Apply every migration that has not run yet. Each file runs inside its own
 * transaction, so a failing migration leaves the schema untouched.
 */
export async function migrateUp(dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await ensureMigrationsTable();
  const files = readMigrationFiles(dir);
  const applied = await getAppliedMigrations();
  const appliedByName = new Map(applied.map((row) => [row.name, row]));

  // Guard against an already-applied migration being edited after the fact.
  for (const file of files) {
    const previous = appliedByName.get(file.name);
    if (previous && previous.checksum !== file.checksum) {
      throw new Error(
        `Migration "${file.name}" has changed since it was applied ` +
          `(expected checksum ${previous.checksum}, found ${file.checksum}). ` +
          'Create a new migration instead of editing an applied one.',
      );
    }
  }

  const pending = files.filter((file) => !appliedByName.has(file.name));
  const executed: string[] = [];

  for (const file of pending) {
    await withTransaction(async (client) => {
      await client.query(file.sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
        file.name,
        file.checksum,
      ]);
    });
    executed.push(file.name);
    logger.info(`Applied migration ${file.name}`);
  }

  if (executed.length === 0) {
    logger.info('No pending migrations — database is up to date');
  }
  return executed;
}

/**
 * Drop every application object and re-run all migrations from scratch.
 * Used by `npm run db:reset` and by the test harness.
 */
export async function migrateReset(dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await withTransaction(async (client) => {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
  });
  logger.info('Dropped and recreated the public schema');
  return migrateUp(dir);
}
