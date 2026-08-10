import { env } from '../../config/env';
import { closePool } from '../pool';
import { runSeed, SEED_USERS } from '../seed';
import { logger } from '../../utils/logger';

runSeed()
  .then(async () => {
    logger.info('Seed complete. Demo credentials:');
    for (const user of SEED_USERS) {
      // eslint-disable-next-line no-console
      console.log(`  ${user.role.padEnd(9)} ${user.email}  /  ${env.SEED_DEFAULT_PASSWORD}`);
    }
    await closePool();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    logger.error('Seed failed', error instanceof Error ? error.message : error);
    await closePool().catch(() => undefined);
    process.exit(1);
  });
