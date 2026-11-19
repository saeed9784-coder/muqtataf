import { bookmarks, postTags, posts, sources, upvotes, follows, type Db } from '@muqtataf/db';
import { and, desc, eq, gt, inArray, or, sql, type SQL } from 'drizzle-orm';

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 50;
export const MAX_OFFSET = 2_000;
/** Popular only ranks recent posts; older ones are reachable via latest/source/tag feeds. */
const POPULAR_WINDOW_DAYS = 14;

export type PostRow = typeof posts.$inferSelect;
export type SourceRow = typeof sources.$inferSelect;

export interface PostView extends Omit<PostRow, 'searchVector' | 'comments' | 'publishedAt' | 'createdAt' | 'sourceId'> {
  publishedAt: string;
  commentsCount: number;
  source: Pick<SourceRow, 'id' | 'name' | 'siteUrl' | 'image'>;
  tags: string[];
  upvoted: boolean;
  bookmarked: boolean;
}

export interface Page {
  limit: number;
  offset: number;
}

export interface PostPage {
  nodes: PostView[];
  nextCursor: string | null;
}

export function parsePage(first: number | null | undefined, after: string | null | undefined): Page {
  const limit = Math.min(Math.max(first ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const parsed = after ? Number.parseInt(after, 10) : 0;
  const offset = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), MAX_OFFSET) : 0;
  return { limit, offset };
}

const postColumns = {
  id: posts.id,
  sourceId: posts.sourceId,
  url: posts.url,
  title: posts.title,
  summary: posts.summary,
  image: posts.image,
  readTime: posts.readTime,
  publishedAt: posts.publishedAt,
  createdAt: posts.createdAt,
  upvotes: posts.upvotes,
  comments: posts.comments,
};

type SelectedPost = Omit<PostRow, 'searchVector'>;

/** Each further post from the same source is multiplied by this, so prolific feeds don't flood the page. */
const SOURCE_DIVERSITY_DECAY = 0.6;

const popularScore = sql`(${posts.upvotes} * 3 + ${posts.comments} * 2 + 1) / power(extract(epoch from (now() - ${posts.publishedAt})) / 3600 + 2, 1.5)`;

const diversifiedScore = sql`${popularScore} * power(${SOURCE_DIVERSITY_DECAY}::float8, row_number() over (partition by ${posts.sourceId} order by ${popularScore} desc) - 1)`;

/** Attaches source, tags and per-user flags with one query each, avoiding N+1 lookups. */
export async function hydrate(db: Db, rows: SelectedPost[], userId: string | null): Promise<PostView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const sourceIds = [...new Set(rows.map((r) => r.sourceId))];

  const userFlags = (table: typeof upvotes | typeof bookmarks) =>
    userId
      ? db.select({ postId: table.postId }).from(table).where(and(eq(table.userId, userId), inArray(table.postId, ids)))
      : Promise.resolve([] as { postId: string }[]);

  const [sourceRows, tagRows, upvoted, bookmarked] = await Promise.all([
    db
      .select({ id: sources.id, name: sources.name, siteUrl: sources.siteUrl, image: sources.image })
      .from(sources)
      .where(inArray(sources.id, sourceIds)),
    db.select().from(postTags).where(inArray(postTags.postId, ids)),
    userFlags(upvotes),
    userFlags(bookmarks),
  ]);

  const sourceById = new Map(sourceRows.map((s) => [s.id, s]));
  const upvotedSet = new Set(upvoted.map((r) => r.postId));
  const bookmarkedSet = new Set(bookmarked.map((r) => r.postId));
  const tagsByPost = Map.groupBy(tagRows, (t) => t.postId);

  return rows.flatMap(({ sourceId, comments, publishedAt, createdAt: _createdAt, ...row }) => {
    const source = sourceById.get(sourceId);
    if (!source) return [];
    return [
      {
        ...row,
        publishedAt: publishedAt.toISOString(),
        commentsCount: comments,
        source,
        tags: (tagsByPost.get(row.id) ?? []).map((t) => t.tag).sort(),
        upvoted: upvotedSet.has(row.id),
        bookmarked: bookmarkedSet.has(row.id),
      },
    ];
  });
}

async function pageOf(
  db: Db,
  query: { where?: SQL; orderBy: SQL[] },
  page: Page,
  userId: string | null,
): Promise<PostPage> {
  const rows = await db
    .select(postColumns)
    .from(posts)
    .where(query.where)
    .orderBy(...query.orderBy)
    .limit(page.limit + 1)
    .offset(page.offset);
  const hasMore = rows.length > page.limit;
  const nodes = await hydrate(db, rows.slice(0, page.limit), userId);
  const nextOffset = page.offset + page.limit;
  return { nodes, nextCursor: hasMore && nextOffset <= MAX_OFFSET ? String(nextOffset) : null };
}

const latestOrder = [desc(posts.publishedAt), desc(posts.id)];

export function popularFeed(db: Db, page: Page, userId: string | null): Promise<PostPage> {
  return pageOf(
    db,
    {
      where: gt(posts.publishedAt, sql`now() - make_interval(days => ${POPULAR_WINDOW_DAYS}::int)`),
      orderBy: [desc(diversifiedScore), ...latestOrder],
    },
    page,
    userId,
  );
}

export function latestFeed(db: Db, page: Page, userId: string | null): Promise<PostPage> {
  return pageOf(db, { orderBy: latestOrder }, page, userId);
}

export async function myFeed(db: Db, page: Page, userId: string): Promise<PostPage> {
  const followed = await db.select({ kind: follows.kind, value: follows.value }).from(follows).where(eq(follows.userId, userId));
  const tags = followed.filter((f) => f.kind === 'tag').map((f) => f.value);
  const sourceIds = followed.filter((f) => f.kind === 'source').map((f) => f.value);
  if (tags.length === 0 && sourceIds.length === 0) return { nodes: [], nextCursor: null };

  const conditions = [
    sourceIds.length > 0 ? inArray(posts.sourceId, sourceIds) : undefined,
    tags.length > 0
      ? inArray(posts.id, db.select({ id: postTags.postId }).from(postTags).where(inArray(postTags.tag, tags)))
      : undefined,
  ].filter((c): c is SQL => c !== undefined);
  return pageOf(db, { where: or(...conditions), orderBy: latestOrder }, page, userId);
}

export function sourceFeed(db: Db, sourceId: string, page: Page, userId: string | null): Promise<PostPage> {
  return pageOf(db, { where: eq(posts.sourceId, sourceId), orderBy: latestOrder }, page, userId);
}

export function tagFeed(db: Db, tag: string, page: Page, userId: string | null): Promise<PostPage> {
  return pageOf(
    db,
    {
      where: inArray(posts.id, db.select({ id: postTags.postId }).from(postTags).where(eq(postTags.tag, tag))),
      orderBy: latestOrder,
    },
    page,
    userId,
  );
}

export function searchPosts(db: Db, text: string, page: Page, userId: string | null): Promise<PostPage> {
  const query = sql`websearch_to_tsquery('english', ${text})`;
  return pageOf(
    db,
    {
      where: sql`${posts.searchVector} @@ ${query}`,
      orderBy: [desc(sql`ts_rank(${posts.searchVector}, ${query})`), ...latestOrder],
    },
    page,
    userId,
  );
}

export async function bookmarkedPosts(db: Db, page: Page, userId: string): Promise<PostPage> {
  const rows = await db
    .select(postColumns)
    .from(bookmarks)
    .innerJoin(posts, eq(posts.id, bookmarks.postId))
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt), desc(posts.id))
    .limit(page.limit + 1)
    .offset(page.offset);
  const hasMore = rows.length > page.limit;
  return {
    nodes: await hydrate(db, rows.slice(0, page.limit), userId),
    nextCursor: hasMore && page.offset + page.limit <= MAX_OFFSET ? String(page.offset + page.limit) : null,
  };
}

export async function postById(db: Db, id: string, userId: string | null): Promise<PostView | null> {
  const rows = await db.select(postColumns).from(posts).where(eq(posts.id, id)).limit(1);
  const [view] = await hydrate(db, rows, userId);
  return view ?? null;
}
