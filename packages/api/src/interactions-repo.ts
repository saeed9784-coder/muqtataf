import { bookmarks, comments, follows, posts, postTags, sources, upvotes, users, type Db } from '@muqtataf/db';
import { and, asc, count, desc, eq, gt, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from './auth';

export type FollowKind = 'tag' | 'source';

export interface CommentView {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; image: string | null };
  canDelete: boolean;
}

export interface MeView {
  id: string;
  name: string;
  image: string | null;
  followedTags: string[];
  followedSources: string[];
}

const TAG_WINDOW_DAYS = 30;
const MAX_COMMENTS_LISTED = 100;
export const MAX_FOLLOWS = 200;

/** Creates or refreshes the user row from token claims. Called before any write. */
export async function ensureUser(db: Db, user: AuthUser): Promise<void> {
  await db
    .insert(users)
    .values(user)
    .onConflictDoUpdate({ target: users.id, set: { name: user.name, email: user.email, image: user.image } });
}

export async function postExists(db: Db, postId: string): Promise<boolean> {
  const rows = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).limit(1);
  return rows.length > 0;
}

/** Toggles a user↔post row and keeps the matching counter on posts in sync. Returns the new state. */
async function toggle(db: Db, table: typeof upvotes | typeof bookmarks, userId: string, postId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(table)
      .where(and(eq(table.userId, userId), eq(table.postId, postId)))
      .returning({ postId: table.postId });
    const isActive = removed.length === 0;
    if (isActive) await tx.insert(table).values({ userId, postId }).onConflictDoNothing();
    if (table === upvotes) {
      await tx
        .update(posts)
        .set({ upvotes: sql`greatest(${posts.upvotes} + ${isActive ? 1 : -1}, 0)` })
        .where(eq(posts.id, postId));
    }
    return isActive;
  });
}

export const toggleUpvote = (db: Db, userId: string, postId: string) => toggle(db, upvotes, userId, postId);
export const toggleBookmark = (db: Db, userId: string, postId: string) => toggle(db, bookmarks, userId, postId);

export async function listComments(db: Db, postId: string, viewerId: string | null): Promise<CommentView[]> {
  const rows = await db
    .select({
      id: comments.id,
      content: comments.content,
      createdAt: comments.createdAt,
      authorId: users.id,
      authorName: users.name,
      authorImage: users.image,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(eq(comments.postId, postId))
    .orderBy(asc(comments.createdAt))
    // The Data API caps responses at 1 MB; 100 comments of up to 2,000 chars stays well under it.
    .limit(MAX_COMMENTS_LISTED);
  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    author: { id: r.authorId, name: r.authorName, image: r.authorImage },
    canDelete: r.authorId === viewerId,
  }));
}

export async function addComment(db: Db, user: AuthUser, postId: string, content: string): Promise<CommentView> {
  const id = randomUUID();
  const createdAt = await db.transaction(async (tx) => {
    const [row] = await tx.insert(comments).values({ id, postId, userId: user.id, content }).returning({ createdAt: comments.createdAt });
    await tx.update(posts).set({ comments: sql`${posts.comments} + 1` }).where(eq(posts.id, postId));
    return row?.createdAt ?? new Date();
  });
  return {
    id,
    content,
    createdAt: createdAt.toISOString(),
    author: { id: user.id, name: user.name, image: user.image },
    canDelete: true,
  };
}

/** Deletes only the caller's own comment. Returns false when nothing matched. */
export async function deleteComment(db: Db, userId: string, commentId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(comments)
      .where(and(eq(comments.id, commentId), eq(comments.userId, userId)))
      .returning({ postId: comments.postId });
    if (!removed) return false;
    await tx
      .update(posts)
      .set({ comments: sql`greatest(${posts.comments} - 1, 0)` })
      .where(eq(posts.id, removed.postId));
    return true;
  });
}

export async function countFollows(db: Db, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(follows).where(eq(follows.userId, userId));
  return row?.n ?? 0;
}

export async function setFollow(db: Db, userId: string, kind: FollowKind, value: string, isFollowing: boolean): Promise<void> {
  if (isFollowing) {
    await db.insert(follows).values({ userId, kind, value }).onConflictDoNothing();
    return;
  }
  await db.delete(follows).where(and(eq(follows.userId, userId), eq(follows.kind, kind), eq(follows.value, value)));
}

export async function sourceExists(db: Db, id: string): Promise<boolean> {
  const rows = await db.select({ id: sources.id }).from(sources).where(eq(sources.id, id)).limit(1);
  return rows.length > 0;
}

export async function getMe(db: Db, user: AuthUser): Promise<MeView> {
  const rows = await db.select({ kind: follows.kind, value: follows.value }).from(follows).where(eq(follows.userId, user.id));
  const pick = (kind: FollowKind) => rows.filter((r) => r.kind === kind).map((r) => r.value).sort();
  return { id: user.id, name: user.name, image: user.image, followedTags: pick('tag'), followedSources: pick('source') };
}

export async function listSources(db: Db) {
  return db
    .select({ id: sources.id, name: sources.name, siteUrl: sources.siteUrl, image: sources.image })
    .from(sources)
    .where(eq(sources.enabled, true))
    .orderBy(asc(sources.name));
}

export async function getSource(db: Db, id: string) {
  const [row] = await db
    .select({ id: sources.id, name: sources.name, siteUrl: sources.siteUrl, image: sources.image })
    .from(sources)
    .where(eq(sources.id, id))
    .limit(1);
  return row ?? null;
}

/** Most used tags among recent posts. */
export async function topTags(db: Db, limit: number): Promise<{ name: string; posts: number }[]> {
  const postsCount = count(postTags.postId);
  return db
    .select({ name: postTags.tag, posts: postsCount })
    .from(postTags)
    .innerJoin(posts, eq(posts.id, postTags.postId))
    .where(gt(posts.publishedAt, sql`now() - make_interval(days => ${TAG_WINDOW_DAYS}::int)`))
    .groupBy(postTags.tag)
    .orderBy(desc(postsCount), asc(postTags.tag))
    .limit(limit);
}
