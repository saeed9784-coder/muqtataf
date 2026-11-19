import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';
import type { Db } from './index';

const DEFAULT_MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * Embedded Postgres for local development and tests.
 * Pass a directory for persistence, or omit it for an in-memory database.
 */
export async function createPgliteDb(
  dataDir?: string,
  migrationsFolder: string = DEFAULT_MIGRATIONS,
): Promise<Db> {
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db as unknown as Db;
}
