import { postTags, posts, sources, type Db } from '@muqtataf/db';
import { eq, inArray } from 'drizzle-orm';
import { fetchFeed, type FetchFn, type ParsedPost } from './feed';
import { fetchOgImage } from './og-image';

const SOURCE_CONCURRENCY = 5;
const OG_CONCURRENCY = 4;

export interface SourceResult {
  sourceId: string;
  inserted: number;
  error?: string;
}

export interface IngestDeps {
  fetchFn?: FetchFn;
  /** Set false to skip fetching article pages for og:image (tests, quick runs). */
  enrichImages?: boolean;
}

/** Runs worker over items with at most `limit` in flight; preserves input order in results. */
export async function mapPool<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const run = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function withImages(list: ParsedPost[], deps: IngestDeps): Promise<ParsedPost[]> {
  if (deps.enrichImages === false) return list;
  return mapPool(list, OG_CONCURRENCY, async (post) =>
    post.image ? post : { ...post, image: await fetchOgImage(post.url, deps.fetchFn) },
  );
}

/** Inserts posts not seen before; returns how many were new. */
export async function savePosts(db: Db, sourceId: string, parsed: ParsedPost[], deps: IngestDeps = {}): Promise<number> {
  if (parsed.length === 0) return 0;
  const existing = await db
    .select({ url: posts.url })
    .from(posts)
    .where(inArray(posts.url, parsed.map((p) => p.url)));
  const known = new Set(existing.map((row) => row.url));
  const fresh = await withImages(parsed.filter((p) => !known.has(p.url)), deps);
  if (fresh.length === 0) return 0;

  const inserted = await db
    .insert(posts)
    .values(fresh.map(({ tags: _tags, ...post }) => ({ ...post, sourceId })))
    .onConflictDoNothing()
    .returning({ id: posts.id });

  const insertedIds = new Set(inserted.map((row) => row.id));
  const tagRows = fresh
    .filter((post) => insertedIds.has(post.id))
    .flatMap((post) => post.tags.map((tag) => ({ postId: post.id, tag })));
  if (tagRows.length > 0) await db.insert(postTags).values(tagRows).onConflictDoNothing();
  return inserted.length;
}

export async function ingestAll(db: Db, deps: IngestDeps = {}): Promise<SourceResult[]> {
  const enabled = await db
    .select({ id: sources.id, feedUrl: sources.feedUrl })
    .from(sources)
    .where(eq(sources.enabled, true));

  return mapPool(enabled, SOURCE_CONCURRENCY, async (source): Promise<SourceResult> => {
    try {
      const parsed = await fetchFeed(source.feedUrl, deps.fetchFn);
      return { sourceId: source.id, inserted: await savePosts(db, source.id, parsed, deps) };
    } catch (error) {
      // One broken feed must not stop the others; the caller logs these results.
      return { sourceId: source.id, inserted: 0, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
