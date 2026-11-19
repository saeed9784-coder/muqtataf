import { beforeEach, describe, expect, it } from 'vitest';
import { setupApi } from './test-utils';

let gql: Awaited<ReturnType<typeof setupApi>>['gql'];

beforeEach(async () => {
  ({ gql } = await setupApi());
});

const POST_FIELDS = 'id title upvotes commentsCount upvoted bookmarked tags source { id name }';
const FEED = `query($type: FeedType!, $first: Int, $after: String) {
  feed(type: $type, first: $first, after: $after) { nodes { ${POST_FIELDS} } nextCursor } }`;

const ids = (res: { data?: Record<string, any> }, key: string) => res.data?.[key].nodes.map((n: { id: string }) => n.id);
const code = (res: { errors?: { extensions?: { code?: string } }[] }) => res.errors?.[0]?.extensions?.code;

describe('feeds', () => {
  it('latest orders by publish date and includes old posts', async () => {
    expect(ids(await gql(FEED, { type: 'LATEST' }), 'feed')).toEqual(['p3', 'p2', 'p1', 'old']);
  });

  it('popular only includes recent posts and ranks upvoted ones higher', async () => {
    await gql('mutation { toggleUpvote(postId: "p1") { id } }', {}, 'sara');
    await gql('mutation { toggleUpvote(postId: "p1") { id } }', {}, 'omar');
    const res = await gql(FEED, { type: 'POPULAR' });
    expect(ids(res, 'feed')).toEqual(['p1', 'p3', 'p2']);
  });

  it('popular spreads posts across sources instead of one source dominating', async () => {
    const { db, gql: query } = await setupApi();
    const { savePosts } = await import('@muqtataf/ingest');
    const { makePost } = await import('./test-utils');
    const now = Date.now();
    await savePosts(db, 'alpha', ['a1', 'a2', 'a3'].map((id, i) => makePost(id, { publishedAt: new Date(now - i * 60_000) })), { enrichImages: false });
    const top = ids(await query(FEED, { type: 'POPULAR', first: 3 }), 'feed');
    expect(top).toContain('p3');
  });

  it('paginates with an offset cursor', async () => {
    const first = await gql(FEED, { type: 'LATEST', first: 2 });
    expect(ids(first, 'feed')).toEqual(['p3', 'p2']);
    expect(first.data?.feed.nextCursor).toBe('2');
    const second = await gql(FEED, { type: 'LATEST', first: 2, after: '2' });
    expect(ids(second, 'feed')).toEqual(['p1', 'old']);
    expect(second.data?.feed.nextCursor).toBeNull();
  });

  it('hydrates source and tags', async () => {
    const res = await gql(`{ post(id: "p1") { ${POST_FIELDS} } }`);
    expect(res.data?.post).toMatchObject({ tags: ['javascript', 'react'], source: { id: 'alpha', name: 'Alpha Blog' }, upvoted: false });
  });

  it('filters by source and tag', async () => {
    expect(ids(await gql('{ sourceFeed(sourceId: "beta") { nodes { id } nextCursor } }'), 'sourceFeed')).toEqual(['p3', 'old']);
    expect(ids(await gql('{ tagFeed(tag: "React") { nodes { id } nextCursor } }'), 'tagFeed')).toEqual(['p1', 'old']);
  });

  it('searches titles with stemming', async () => {
    expect(ids(await gql('{ search(query: "component") { nodes { id } nextCursor } }'), 'search')).toEqual(['p1']);
  });

  it('rejects too-short search queries', async () => {
    expect(code(await gql('{ search(query: "a") { nodes { id } } }'))).toBe('BAD_USER_INPUT');
  });

  it('my feed requires sign-in and follows tags and sources', async () => {
    expect(code(await gql(FEED, { type: 'MY' }))).toBe('UNAUTHENTICATED');
    expect(ids(await gql(FEED, { type: 'MY' }, 'sara'), 'feed')).toEqual([]);
    await gql('mutation { follow(kind: TAG, value: "rust") { id } }', {}, 'sara');
    await gql('mutation { follow(kind: SOURCE, value: "beta") { followedSources } }', {}, 'sara');
    expect(ids(await gql(FEED, { type: 'MY' }, 'sara'), 'feed')).toEqual(['p3', 'p2', 'old']);
  });
});

describe('upvotes and bookmarks', () => {
  it('toggles upvotes and keeps the counter in sync', async () => {
    const on = await gql('mutation { toggleUpvote(postId: "p2") { upvotes upvoted } }', {}, 'sara');
    expect(on.data?.toggleUpvote).toEqual({ upvotes: 1, upvoted: true });
    const off = await gql('mutation { toggleUpvote(postId: "p2") { upvotes upvoted } }', {}, 'sara');
    expect(off.data?.toggleUpvote).toEqual({ upvotes: 0, upvoted: false });
  });

  it('bookmarks show up in the bookmarks feed only for that user', async () => {
    await gql('mutation { toggleBookmark(postId: "p1") { bookmarked } }', {}, 'sara');
    expect(ids(await gql('{ bookmarks { nodes { id bookmarked } nextCursor } }', {}, 'sara'), 'bookmarks')).toEqual(['p1']);
    expect(ids(await gql('{ bookmarks { nodes { id } nextCursor } }', {}, 'omar'), 'bookmarks')).toEqual([]);
  });

  it('requires auth and an existing post', async () => {
    expect(code(await gql('mutation { toggleUpvote(postId: "p1") { id } }'))).toBe('UNAUTHENTICATED');
    expect(code(await gql('mutation { toggleUpvote(postId: "missing") { id } }', {}, 'sara'))).toBe('NOT_FOUND');
  });
});

describe('comments', () => {
  const ADD = 'mutation($c: String!) { addComment(postId: "p1", content: $c) { id content author { name } canDelete } }';

  it('adds, lists and counts comments', async () => {
    const added = await gql(ADD, { c: '  مقال رائع  ' }, 'sara');
    expect(added.data?.addComment).toMatchObject({ content: 'مقال رائع', author: { name: 'sara' }, canDelete: true });
    const list = await gql('{ comments(postId: "p1") { content canDelete } post(id: "p1") { commentsCount } }', {}, 'omar');
    expect(list.data?.comments).toEqual([{ content: 'مقال رائع', canDelete: false }]);
    expect(list.data?.post.commentsCount).toBe(1);
  });

  it('only lets the author delete a comment', async () => {
    const id = (await gql(ADD, { c: 'hi' }, 'sara')).data?.addComment.id;
    const del = 'mutation($id: ID!) { deleteComment(id: $id) }';
    expect((await gql(del, { id }, 'omar')).data?.deleteComment).toBe(false);
    expect((await gql(del, { id }, 'sara')).data?.deleteComment).toBe(true);
    expect((await gql('{ post(id: "p1") { commentsCount } }')).data?.post.commentsCount).toBe(0);
  });

  it('rejects empty and oversized comments', async () => {
    expect(code(await gql(ADD, { c: '   ' }, 'sara'))).toBe('BAD_USER_INPUT');
    expect(code(await gql(ADD, { c: 'x'.repeat(2001) }, 'sara'))).toBe('BAD_USER_INPUT');
  });
});

describe('sources, tags and me', () => {
  it('lists sources and top recent tags', async () => {
    const res = await gql('{ sources { id } tags { name posts } source(id: "alpha") { name } }');
    expect(res.data?.sources.map((s: { id: string }) => s.id)).toEqual(['alpha', 'beta']);
    expect(res.data?.tags[0]).toEqual({ name: 'go', posts: 1 });
    expect(res.data?.tags.map((t: { name: string }) => t.name)).not.toContain('missing');
    expect(res.data?.source.name).toBe('Alpha Blog');
  });

  it('returns null me when anonymous and follow state when signed in', async () => {
    expect((await gql('{ me { id } }')).data?.me).toBeNull();
    await gql('mutation { follow(kind: TAG, value: "go") { id } }', {}, 'sara');
    const me = await gql('{ me { name followedTags } }', {}, 'sara');
    expect(me.data?.me).toEqual({ name: 'sara', followedTags: ['go'] });
    const after = await gql('mutation { unfollow(kind: TAG, value: "go") { followedTags } }', {}, 'sara');
    expect(after.data?.unfollow.followedTags).toEqual([]);
  });

  it('validates follow input', async () => {
    expect(code(await gql('mutation { follow(kind: TAG, value: "<b>") { id } }', {}, 'sara'))).toBe('BAD_USER_INPUT');
    expect(code(await gql('mutation { follow(kind: SOURCE, value: "nope") { id } }', {}, 'sara'))).toBe('NOT_FOUND');
  });
});

describe('limits', () => {
  it('rejects operations with too many aliased root fields', async () => {
    const aliases = Array.from({ length: 9 }, (_, i) => `f${i}: feed(type: LATEST) { nextCursor }`).join(' ');
    const res = await gql(`{ ${aliases} }`);
    expect(res.errors?.[0]?.message).toContain('Too many top-level fields');
  });

  it('caps the number of follows per user', async () => {
    const { db, gql: query } = await setupApi();
    const { follows, users } = await import('@muqtataf/db');
    await db.insert(users).values({ id: 'dev-sara', name: 'sara' });
    await db.insert(follows).values(Array.from({ length: 200 }, (_, i) => ({ userId: 'dev-sara', kind: 'tag' as const, value: `tag${i}` })));
    expect(code(await query('mutation { follow(kind: TAG, value: "rust") { id } }', {}, 'sara'))).toBe('BAD_USER_INPUT');
  });
});

describe('ingest dedupe', () => {
  it('does not insert the same URL twice', async () => {
    const { db } = await setupApi();
    const { savePosts } = await import('@muqtataf/ingest');
    const { makePost } = await import('./test-utils');
    expect(await savePosts(db, 'alpha', [makePost('p1')], { enrichImages: false })).toBe(0);
    expect(await savePosts(db, 'alpha', [makePost('new1')], { enrichImages: false })).toBe(1);
  });
});
