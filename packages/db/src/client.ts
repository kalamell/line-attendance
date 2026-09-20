import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { DATABASE_URL } from './env';
import { schema } from './schema';

export const pool = new pg.Pool({ connectionString: DATABASE_URL });
export const db = drizzle(pool, { schema, casing: 'snake_case' });
export type Db = typeof db;
