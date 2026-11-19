import Link from 'next/link';
import { timeAgo } from '@/lib/format';
import type { Post } from '@/lib/queries';
import { t } from '@/lib/strings';
import { PostActions } from './PostActions';
import { SourceAvatar } from './SourceAvatar';

export function PostCard({ post }: { post: Post }) {
  const href = `/post/?id=${encodeURIComponent(post.id)}`;
  return (
    <article className="group flex flex-col rounded-2xl border border-border bg-surface p-3 transition-colors hover:border-muted/50">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted">
        <Link href={`/source/?id=${encodeURIComponent(post.source.id)}`} className="flex min-w-0 items-center gap-2 hover:text-text">
          <SourceAvatar name={post.source.name} image={post.source.image} />
          <span className="truncate" dir="auto">{post.source.name}</span>
        </Link>
        <span aria-hidden="true">•</span>
        <time dateTime={post.publishedAt} className="shrink-0">{timeAgo(post.publishedAt)}</time>
        {post.readTime && (
          <>
            <span aria-hidden="true">•</span>
            <span className="shrink-0">{t.post.readTime(post.readTime)}</span>
          </>
        )}
      </div>

      <h2 className="mb-2 line-clamp-3 text-lg font-bold leading-snug" dir="auto">
        <Link href={href} className="hover:text-accent">{post.title}</Link>
      </h2>

      {post.tags.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-1.5" dir="ltr">
          {post.tags.slice(0, 3).map((tag) => (
            <li key={tag}>
              <Link href={`/tag/?name=${encodeURIComponent(tag)}`} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted hover:text-text">
                #{tag}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link href={href} className="mt-auto block overflow-hidden rounded-xl bg-surface-2" tabIndex={-1} aria-hidden="true">
        {post.image ? (
          <img src={post.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[1.9] w-full object-cover transition-transform group-hover:scale-[1.02]" />
        ) : (
          <div className="flex aspect-[1.9] items-center justify-center p-4 text-center text-sm text-muted" dir="auto">
            <span className="line-clamp-3">{post.summary ?? post.source.name}</span>
          </div>
        )}
      </Link>

      <div className="mt-2">
        <PostActions post={post} />
      </div>
    </article>
  );
}
