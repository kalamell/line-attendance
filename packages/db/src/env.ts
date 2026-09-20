import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load the repo-root .env regardless of cwd (works from packages/db, apps/api, or root).
for (const rel of ['.env', '../.env', '../../.env', '../../../.env']) {
  const abs = resolve(process.cwd(), rel);
  if (existsSync(abs)) {
    config({ path: abs });
    break;
  }
}

export const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://poszee:poszee@localhost:5432/poszee';
