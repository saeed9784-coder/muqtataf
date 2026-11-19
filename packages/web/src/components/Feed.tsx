'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useFeed, type FeedKind } from '@/lib/queries';
import { t } from '@/lib/strings';
import { PostCard } from './PostCard';
import { CardSkeletons, EmptyState, ErrorState, Spinner } from './States';

interface FeedProps {
  kind: FeedKind;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  isEnabled?: boolean;
}

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4';

export function Feed({ kind, emptyMessage = t.feed.empty, emptyAction, isEnabled = true }: FeedProps) {
  const query = useFeed(kind, isEnabled);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  // Infinite scroll: fetch the next page when the sentinel nears the viewport.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry?.isIntersecting && !isFetchingNextPage && void fetchNextPage(),
      { rootMargin: '600px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (query.isPending && isEnabled) return <div className={GRID}><CardSkeletons /></div>;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  // Popular ranking shifts over time, so offset pages can overlap; keep the first occurrence.
  const seen = new Set<string>();
  const posts = (query.data?.pages.flatMap((p) => p.nodes) ?? []).filter((p) => !seen.has(p.id) && Boolean(seen.add(p.id)));
  if (posts.length === 0) return <EmptyState message={emptyMessage}>{emptyAction}</EmptyState>;

  return (
    <>
      <div className={GRID}>
        {posts.map((post) => <PostCard key={post.id} post={post} />)}
      </div>
      <div ref={sentinel} className="flex justify-center py-8 text-sm text-muted">
        {isFetchingNextPage ? <Spinner /> : hasNextPage ? (
          <button type="button" onClick={() => void fetchNextPage()} className="rounded-lg bg-surface px-4 py-2 hover:bg-surface-2">
            {t.feed.loadMore}
          </button>
        ) : t.feed.end}
      </div>
    </>
  );
}
