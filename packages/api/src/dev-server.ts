/** Local API on http://localhost:4000/graphql with embedded Postgres (PGlite) and dev auth. */
import { seedSources } from '@muqtataf/db';
import { createPgliteDb } from '@muqtataf/db/pglite';
import { ingestAll } from '@muqtataf/ingest';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { devAuthenticator } from './auth';
import { createApi } from './yoga';

const PORT = Number(process.env.PORT ?? 4000);
const INGEST_INTERVAL_MS = 30 * 60 * 1000;
const dataDir = fileURLToPath(new URL('../../../.data/pglite', import.meta.url));

mkdirSync(dataDir, { recursive: true });
const db = await createPgliteDb(dataDir);
await seedSources(db);

const runIngest = async () => {
  const results = await ingestAll(db);
  const inserted = results.reduce((sum, r) => sum + r.inserted, 0);
  const failed = results.filter((r) => r.error).map((r) => `${r.sourceId}: ${r.error}`);
  console.info(`[ingest] +${inserted} posts${failed.length ? `, failed: ${failed.join('; ')}` : ''}`);
};
void runIngest();
setInterval(() => void runIngest(), INGEST_INTERVAL_MS);

const api = createApi({ db, authenticate: devAuthenticator, isDev: true });
createServer(api).listen(PORT, () => console.info(`API ready at http://localhost:${PORT}/graphql`));
