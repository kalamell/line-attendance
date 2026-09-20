import { pool } from './client';
import { runMigrations } from './migrate';
import { seed } from './seed';

// db:reset — drop everything, re-migrate, re-seed. Dev only.
export async function reset(): Promise<void> {
  console.log('⚠ dropping schema public …');
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await runMigrations();
  await seed();
  console.log('✓ db reset complete');
}

if (require.main === module) {
  reset()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}
