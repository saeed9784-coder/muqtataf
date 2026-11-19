import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export * from './schema';
export { schema };
export { SEED_SOURCES, seedSources, type SeedSource } from './seed';

/** Driver-agnostic database handle: PGlite locally and in tests, RDS Data API on AWS. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export const MIGRATIONS_FOLDER_NAME = 'drizzle';
