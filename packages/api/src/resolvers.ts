import type { Db } from '@muqtataf/db';
import { createGraphQLError } from 'graphql-yoga';
import { z } from 'zod';
import type { AuthUser } from './auth';
import * as interactions from './interactions-repo';
import * as postsRepo from './posts-repo';

export interface Context {
  db: Db;
  user: AuthUser | null;
}

const MAX_TAGS_LIMIT = 200;
const DEFAULT_TAGS_LIMIT = 60;

const idSchema = z.string().trim().min(1).max(64);
const tagSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9+#.-]{2,32}$/);
const searchSchema = z.string().trim().min(2).max(120);
const commentSchema = z.string().trim().min(1).max(2_000);

function parse<T>(schema: z.ZodType<T>, value: unknown, field: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw createGraphQLError(`Invalid ${field}`, { extensions: { code: 'BAD_USER_INPUT', field } });
  }
  return result.data;
}

function requireUser(ctx: Context): AuthUser {
  if (!ctx.user) throw createGraphQLError('Sign in required', { extensions: { code: 'UNAUTHENTICATED' } });
  return ctx.user;
}

const notFound = (what: string) => createGraphQLError(`${what} not found`, { extensions: { code: 'NOT_FOUND' } });

interface PageArgs {
  first?: number | null;
  after?: string | null;
}

const page = (args: PageArgs) => postsRepo.parsePage(args.first, args.after);
const viewerId = (ctx: Context) => ctx.user?.id ?? null;

async function requirePost(ctx: Context, rawId: unknown): Promise<string> {
  const postId = parse(idSchema, rawId, 'postId');
  if (!(await interactions.postExists(ctx.db, postId))) throw notFound('Post');
  return postId;
}

async function reloadPost(ctx: Context, postId: string) {
  const post = await postsRepo.postById(ctx.db, postId, viewerId(ctx));
  if (!post) throw notFound('Post');
  return post;
}

async function validateFollow(ctx: Context, kind: 'TAG' | 'SOURCE', value: unknown): Promise<[interactions.FollowKind, string]> {
  if (kind === 'TAG') return ['tag', parse(tagSchema, value, 'value')];
  const sourceId = parse(idSchema, value, 'value');
  if (!(await interactions.sourceExists(ctx.db, sourceId))) throw notFound('Source');
  return ['source', sourceId];
}

async function changeFollow(ctx: Context, args: { kind: 'TAG' | 'SOURCE'; value: string }, isFollowing: boolean) {
  const user = requireUser(ctx);
  const [kind, value] = await validateFollow(ctx, args.kind, args.value);
  await interactions.ensureUser(ctx.db, user);
  if (isFollowing && (await interactions.countFollows(ctx.db, user.id)) >= interactions.MAX_FOLLOWS) {
    throw createGraphQLError('Follow limit reached', { extensions: { code: 'BAD_USER_INPUT', field: 'value' } });
  }
  await interactions.setFollow(ctx.db, user.id, kind, value, isFollowing);
  return interactions.getMe(ctx.db, user);
}

export const resolvers = {
  Query: {
    feed: (_: unknown, args: PageArgs & { type: 'POPULAR' | 'LATEST' | 'MY' }, ctx: Context) => {
      if (args.type === 'MY') return postsRepo.myFeed(ctx.db, page(args), requireUser(ctx).id);
      const load = args.type === 'POPULAR' ? postsRepo.popularFeed : postsRepo.latestFeed;
      return load(ctx.db, page(args), viewerId(ctx));
    },
    sourceFeed: (_: unknown, args: PageArgs & { sourceId: string }, ctx: Context) =>
      postsRepo.sourceFeed(ctx.db, parse(idSchema, args.sourceId, 'sourceId'), page(args), viewerId(ctx)),
    tagFeed: (_: unknown, args: PageArgs & { tag: string }, ctx: Context) =>
      postsRepo.tagFeed(ctx.db, parse(tagSchema, args.tag, 'tag'), page(args), viewerId(ctx)),
    search: (_: unknown, args: PageArgs & { query: string }, ctx: Context) =>
      postsRepo.searchPosts(ctx.db, parse(searchSchema, args.query, 'query'), page(args), viewerId(ctx)),
    bookmarks: (_: unknown, args: PageArgs, ctx: Context) =>
      postsRepo.bookmarkedPosts(ctx.db, page(args), requireUser(ctx).id),
    post: (_: unknown, args: { id: string }, ctx: Context) =>
      postsRepo.postById(ctx.db, parse(idSchema, args.id, 'id'), viewerId(ctx)),
    comments: (_: unknown, args: { postId: string }, ctx: Context) =>
      interactions.listComments(ctx.db, parse(idSchema, args.postId, 'postId'), viewerId(ctx)),
    sources: (_: unknown, __: unknown, ctx: Context) => interactions.listSources(ctx.db),
    source: (_: unknown, args: { id: string }, ctx: Context) =>
      interactions.getSource(ctx.db, parse(idSchema, args.id, 'id')),
    tags: (_: unknown, args: { first?: number | null }, ctx: Context) =>
      interactions.topTags(ctx.db, Math.min(Math.max(args.first ?? DEFAULT_TAGS_LIMIT, 1), MAX_TAGS_LIMIT)),
    me: (_: unknown, __: unknown, ctx: Context) => (ctx.user ? interactions.getMe(ctx.db, ctx.user) : null),
  },
  Mutation: {
    toggleUpvote: async (_: unknown, args: { postId: string }, ctx: Context) => {
      const user = requireUser(ctx);
      const postId = await requirePost(ctx, args.postId);
      await interactions.ensureUser(ctx.db, user);
      await interactions.toggleUpvote(ctx.db, user.id, postId);
      return reloadPost(ctx, postId);
    },
    toggleBookmark: async (_: unknown, args: { postId: string }, ctx: Context) => {
      const user = requireUser(ctx);
      const postId = await requirePost(ctx, args.postId);
      await interactions.ensureUser(ctx.db, user);
      await interactions.toggleBookmark(ctx.db, user.id, postId);
      return reloadPost(ctx, postId);
    },
    addComment: async (_: unknown, args: { postId: string; content: string }, ctx: Context) => {
      const user = requireUser(ctx);
      const content = parse(commentSchema, args.content, 'content');
      const postId = await requirePost(ctx, args.postId);
      await interactions.ensureUser(ctx.db, user);
      return interactions.addComment(ctx.db, user, postId, content);
    },
    deleteComment: (_: unknown, args: { id: string }, ctx: Context) =>
      interactions.deleteComment(ctx.db, requireUser(ctx).id, parse(idSchema, args.id, 'id')),
    follow: (_: unknown, args: { kind: 'TAG' | 'SOURCE'; value: string }, ctx: Context) => changeFollow(ctx, args, true),
    unfollow: (_: unknown, args: { kind: 'TAG' | 'SOURCE'; value: string }, ctx: Context) => changeFollow(ctx, args, false),
  },
};
