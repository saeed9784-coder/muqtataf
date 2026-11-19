'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { gql } from './gql';

export interface Source {
  id: string;
  name: string;
  siteUrl: string;
  image: string | null;
}

export interface Post {
  id: string;
  url: string;
  title: string;
  summary: string | null;
  image: string | null;
  readTime: number | null;
  publishedAt: string;
  source: Source;
  tags: string[];
  upvotes: number;
  commentsCount: number;
  upvoted: boolean;
  bookmarked: boolean;
}

export interface PostPage {
  nodes: Post[];
  nextCursor: string | null;
}

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; image: string | null };
  canDelete: boolean;
}

export interface Me {
  id: string;
  name: string;
  image: string | null;
  followedTags: string[];
  followedSources: string[];
}

export type FeedKind =
  | { type: 'POPULAR' | 'LATEST' | 'MY' }
  | { type: 'SOURCE'; sourceId: string }
  | { type: 'TAG'; tag: string }
  | { type: 'SEARCH'; query: string }
  | { type: 'BOOKMARKS' };

const SOURCE_FIELDS = 'id name siteUrl image';
const POST_FIELDS = `id url title summary image readTime publishedAt tags upvotes commentsCount upvoted bookmarked source { ${SOURCE_FIELDS} }`;
const PAGE = `nodes { ${POST_FIELDS} } nextCursor`;
const PAGE_SIZE = 24;

function feedRequest(kind: FeedKind, after: string | null): Promise<PostPage> {
  const vars = { first: PAGE_SIZE, after };
  switch (kind.type) {
    case 'SOURCE':
      return gql<{ r: PostPage }>(`query($id: ID!, $first: Int, $after: String) { r: sourceFeed(sourceId: $id, first: $first, after: $after) { ${PAGE} } }`, { ...vars, id: kind.sourceId }).then((d) => d.r);
    case 'TAG':
      return gql<{ r: PostPage }>(`query($tag: String!, $first: Int, $after: String) { r: tagFeed(tag: $tag, first: $first, after: $after) { ${PAGE} } }`, { ...vars, tag: kind.tag }).then((d) => d.r);
    case 'SEARCH':
      return gql<{ r: PostPage }>(`query($q: String!, $first: Int, $after: String) { r: search(query: $q, first: $first, after: $after) { ${PAGE} } }`, { ...vars, q: kind.query }).then((d) => d.r);
    case 'BOOKMARKS':
      return gql<{ r: PostPage }>(`query($first: Int, $after: String) { r: bookmarks(first: $first, after: $after) { ${PAGE} } }`, vars).then((d) => d.r);
    default:
      return gql<{ r: PostPage }>(`query($type: FeedType!, $first: Int, $after: String) { r: feed(type: $type, first: $first, after: $after) { ${PAGE} } }`, { ...vars, type: kind.type }).then((d) => d.r);
  }
}

export const feedKey = (kind: FeedKind) => ['posts', 'feed', kind] as const;
const postKey = (id: string) => ['posts', 'one', id] as const;

export function useFeed(kind: FeedKind, isEnabled = true) {
  return useInfiniteQuery({
    queryKey: feedKey(kind),
    queryFn: ({ pageParam }) => feedRequest(kind, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: isEnabled,
  });
}

export function usePost(id: string | null) {
  return useQuery({
    queryKey: postKey(id ?? ''),
    queryFn: () => gql<{ post: Post | null }>(`query($id: ID!) { post(id: $id) { ${POST_FIELDS} } }`, { id }).then((d) => d.post),
    enabled: Boolean(id),
  });
}

/** Writes an updated post into every cached feed page and the single-post cache, immutably. */
function replacePost(client: QueryClient, post: Post): void {
  client.setQueriesData<InfiniteData<PostPage>>({ queryKey: ['posts', 'feed'] }, (data) =>
    data
      ? { ...data, pages: data.pages.map((p) => ({ ...p, nodes: p.nodes.map((n) => (n.id === post.id ? post : n)) })) }
      : data,
  );
  client.setQueryData(postKey(post.id), post);
}

function usePostMutation(field: 'toggleUpvote' | 'toggleBookmark') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) =>
      gql<Record<typeof field, Post>>(`mutation($id: ID!) { ${field}(postId: $id) { ${POST_FIELDS} } }`, { id: postId }).then((d) => d[field]),
    onSuccess: (post) => {
      replacePost(client, post);
      if (field === 'toggleBookmark') void client.invalidateQueries({ queryKey: feedKey({ type: 'BOOKMARKS' }) });
    },
  });
}

export const useToggleUpvote = () => usePostMutation('toggleUpvote');
export const useToggleBookmark = () => usePostMutation('toggleBookmark');

const COMMENT_FIELDS = 'id content createdAt canDelete author { id name image }';

export function useComments(postId: string | null) {
  return useQuery({
    queryKey: ['comments', postId],
    queryFn: () => gql<{ comments: Comment[] }>(`query($id: ID!) { comments(postId: $id) { ${COMMENT_FIELDS} } }`, { id: postId }).then((d) => d.comments),
    enabled: Boolean(postId),
  });
}

export function useAddComment(postId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (content: string) =>
      gql<{ addComment: Comment }>(`mutation($id: ID!, $c: String!) { addComment(postId: $id, content: $c) { ${COMMENT_FIELDS} } }`, { id: postId, c: content }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['comments', postId] });
      void client.invalidateQueries({ queryKey: postKey(postId) });
      void client.invalidateQueries({ queryKey: ['posts', 'feed'], refetchType: 'none' });
    },
  });
}

export function useDeleteComment(postId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => gql<{ deleteComment: boolean }>(`mutation($id: ID!) { deleteComment(id: $id) }`, { id }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['comments', postId] });
      void client.invalidateQueries({ queryKey: postKey(postId) });
      void client.invalidateQueries({ queryKey: ['posts', 'feed'], refetchType: 'none' });
    },
  });
}

export function useSources() {
  return useQuery({
    queryKey: ['sources'],
    queryFn: () => gql<{ sources: Source[] }>(`{ sources { ${SOURCE_FIELDS} } }`).then((d) => d.sources),
    staleTime: 10 * 60 * 1000,
  });
}

export function useSource(id: string | null) {
  return useQuery({
    queryKey: ['source', id],
    queryFn: () => gql<{ source: Source | null }>(`query($id: ID!) { source(id: $id) { ${SOURCE_FIELDS} } }`, { id }).then((d) => d.source),
    enabled: Boolean(id),
  });
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => gql<{ tags: { name: string; posts: number }[] }>(`{ tags(first: 80) { name posts } }`).then((d) => d.tags),
    staleTime: 10 * 60 * 1000,
  });
}

const ME_FIELDS = 'id name image followedTags followedSources';

export function useMe(isEnabled: boolean) {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => gql<{ me: Me | null }>(`{ me { ${ME_FIELDS} } }`).then((d) => d.me),
    enabled: isEnabled,
  });
}

export function useFollow() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, value, isFollowing }: { kind: 'TAG' | 'SOURCE'; value: string; isFollowing: boolean }) => {
      const op = isFollowing ? 'follow' : 'unfollow';
      return gql<Record<string, Me>>(`mutation($k: FollowKind!, $v: String!) { r: ${op}(kind: $k, value: $v) { ${ME_FIELDS} } }`, { k: kind, v: value }).then((d) => d.r as Me);
    },
    onSuccess: (me) => {
      client.setQueryData(['me'], me);
      void client.invalidateQueries({ queryKey: feedKey({ type: 'MY' }) });
    },
  });
}
