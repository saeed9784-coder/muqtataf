'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { formatCount } from '@/lib/format';
import { useToggleBookmark, useToggleUpvote, type Post } from '@/lib/queries';
import { t } from '@/lib/strings';
import { BookmarkIcon, CommentIcon, UpvoteIcon } from './icons';

const buttonBase = 'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-surface-2 disabled:opacity-60';

export function PostActions({ post, hasCommentLink = true }: { post: Post; hasCommentLink?: boolean }) {
  const { user, signIn } = useAuth();
  const upvote = useToggleUpvote();
  const bookmark = useToggleBookmark();

  const guard = (action: () => void) => () => (user ? action() : void signIn());

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={guard(() => upvote.mutate(post.id))}
        disabled={upvote.isPending}
        aria-pressed={post.upvoted}
        aria-label={t.post.upvote}
        className={`${buttonBase} ${post.upvoted ? 'text-upvote' : 'text-muted'}`}
      >
        <UpvoteIcon fill={post.upvoted ? 'currentColor' : 'none'} />
        <span>{formatCount(post.upvotes)}</span>
      </button>
      {hasCommentLink && (
        <Link href={`/post/?id=${encodeURIComponent(post.id)}#comments`} className={`${buttonBase} text-muted`} aria-label={t.post.comments}>
          <CommentIcon />
          <span>{formatCount(post.commentsCount)}</span>
        </Link>
      )}
      <button
        type="button"
        onClick={guard(() => bookmark.mutate(post.id))}
        disabled={bookmark.isPending}
        aria-pressed={post.bookmarked}
        aria-label={post.bookmarked ? t.post.bookmarked : t.post.bookmark}
        className={`${buttonBase} ms-auto ${post.bookmarked ? 'text-accent' : 'text-muted'}`}
      >
        <BookmarkIcon fill={post.bookmarked ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}
