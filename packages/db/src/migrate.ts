import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { resolve } from 'node:path';
import { DATABASE_URL } from './env';

// migrations run from the db package dir (pnpm --filter @poszee/db …), so cwd/drizzle is correct.
const migrationsFolder = resolve(process.cwd(), 'drizzle');

export async function runMigrations(): Promise<void> {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder });
  await pool.end();
  console.log('✓ migrations applied');
}

if (require.main === module) {
  runMigrations().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
