/** Fetches every seed feed once and prints how many items parse. Usage: npm run check-feeds -w @muqtataf/ingest */
import { SEED_SOURCES } from '@muqtataf/db';
import { fetchFeed } from './feed';
import { mapPool } from './ingest';

const rows = await mapPool(SEED_SOURCES, 6, async (s) => {
  try {
    const items = await fetchFeed(s.feedUrl);
    const withImage = items.filter((i) => i.image).length;
    return `ok    ${s.id.padEnd(16)} ${String(items.length).padStart(3)} items, ${withImage} with image`;
  } catch (error) {
    return `FAIL  ${s.id.padEnd(16)} ${error instanceof Error ? error.message : String(error)}`;
  }
});
process.stdout.write(`${rows.join('\n')}\n`);
