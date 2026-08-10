/**
 * Migration CLI.
 *   npm run migrate           -> apply pending migrations
 *   npm run migrate:status    -> show applied vs pending
 *   tsx src/db/cli/migrate.ts reset -> drop everything and re-apply (destructive)
 */
import { closePool } from '../pool';
import { getAppliedMigrations, migrateReset, migrateUp, readMigrationFiles } from '../migrator';
import { logger } from '../../utils/logger';

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'up';

  switch (command) {
    case 'up': {
      const executed = await migrateUp();
      logger.info(`Migration complete (${executed.length} applied)`);
      break;
    }
    case 'reset': {
      const executed = await migrateReset();
      logger.info(`Database reset complete (${executed.length} migrations applied)`);
      break;
    }
    case 'status': {
      const files = readMigrationFiles();
      const applied = new Set((await getAppliedMigrations()).map((row) => row.name));
      for (const file of files) {
        // eslint-disable-next-line no-console
        console.log(`${applied.has(file.name) ? '  applied' : '  PENDING'}  ${file.name}`);
      }
      break;
    }
    default:
      throw new Error(`Unknown command "${command}". Use: up | reset | status`);
  }
}

main()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    logger.error('Migration failed', error instanceof Error ? error.message : error);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
