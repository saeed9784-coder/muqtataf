'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { ExternalIcon } from '@/components/icons';
import { PostActions } from '@/components/PostActions';
import { SourceAvatar } from '@/components/SourceAvatar';
import { EmptyState, ErrorState, Spinner } from '@/components/States';
import { useAuth } from '@/lib/auth';
import { formatDate, timeAgo } from '@/lib/format';
import { useAddComment, useComments, useDeleteComment, usePost, type Post } from '@/lib/queries';
import { t } from '@/lib/strings';

const MAX_COMMENT_LENGTH = 2_000;

function CommentForm({ postId }: { postId: string }) {
  const { user, signIn } = useAuth();
  const [content, setContent] = useState('');
  const add = useAddComment(postId);

  if (!user) {
    return (
      <button type="button" onClick={() => void signIn()} className="w-full rounded-xl border border-border bg-surface p-4 text-start text-muted hover:border-muted/50">
        {t.comments.placeholder}
      </button>
    );
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = content.trim();
    if (text) add.mutate(text, { onSuccess: () => setContent('') });
  };

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-border bg-surface p-3 focus-within:border-accent">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={MAX_COMMENT_LENGTH}
        rows={3}
        dir="auto"
        placeholder={t.comments.placeholder}
        aria-label={t.comments.placeholder}
        className="w-full resize-y bg-transparent text-sm placeholder:text-muted focus:outline-none"
      />
      {add.isError && <p role="alert" className="mb-2 text-sm text-danger">{t.errors.generic}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={!content.trim() || add.isPending} className="rounded-lg bg-text px-4 py-1.5 text-sm font-bold text-bg disabled:opacity-40">
          {t.comments.submit}
        </button>
      </div>
    </form>
  );
}

function Comments({ postId }: { postId: string }) {
  const comments = useComments(postId);
  const remove = useDeleteComment(postId);

  return (
    <section id="comments" aria-labelledby="comments-title" className="mt-10 flex flex-col gap-4">
      <h2 id="comments-title" className="text-lg font-bold">{t.post.comments}</h2>
      <CommentForm postId={postId} />
      {comments.isPending && <Spinner />}
      {comments.isError && <ErrorState onRetry={() => void comments.refetch()} />}
      {comments.data?.length === 0 && <p className="text-sm text-muted">{t.comments.empty}</p>}
      <ul className="flex flex-col gap-3">
        {comments.data?.map((c) => (
          <li key={c.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center gap-2 text-sm">
              <SourceAvatar name={c.author.name} image={c.author.image} />
              <span className="font-medium" dir="auto">{c.author.name}</span>
              <time dateTime={c.createdAt} className="text-xs text-muted">{timeAgo(c.createdAt)}</time>
              {c.canDelete && (
                <button
                  type="button"
                  onClick={() => window.confirm(t.comments.confirmDelete) && remove.mutate(c.id)}
                  className="ms-auto text-xs text-muted hover:text-danger"
                >
                  {t.comments.delete}
                </button>
              )}
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed" dir="auto">{c.content}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PostDetails({ post }: { post: Post }) {
  return (
    <article>
      <Link href={`/source/?id=${encodeURIComponent(post.source.id)}`} className="mb-4 inline-flex items-center gap-2 text-sm text-muted hover:text-text">
        <SourceAvatar name={post.source.name} image={post.source.image} size="md" />
        <span dir="auto">{post.source.name}</span>
      </Link>
      <h1 className="mb-3 text-3xl font-bold leading-tight" dir="auto">{post.title}</h1>
      <p className="mb-4 flex flex-wrap gap-x-3 text-sm text-muted">
        <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
        {post.readTime && <span>{t.post.readTime(post.readTime)}</span>}
        <span>{t.post.englishNote}</span>
      </p>
      {post.tags.length > 0 && (
        <ul className="mb-5 flex flex-wrap gap-1.5" dir="ltr">
          {post.tags.map((tag) => (
            <li key={tag}>
              <Link href={`/tag/?name=${encodeURIComponent(tag)}`} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted hover:text-text">#{tag}</Link>
            </li>
          ))}
        </ul>
      )}
      {post.summary && <p className="mb-5 leading-relaxed text-muted" dir="auto">{post.summary}</p>}
      <a
        href={post.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-6 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 font-bold text-white hover:opacity-90"
      >
        {t.post.read}
        <ExternalIcon className="-scale-x-100" />
      </a>
      {post.image && (
        <a href={post.url} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true">
          <img src={post.image} alt="" referrerPolicy="no-referrer" className="mb-4 w-full rounded-2xl object-cover" />
        </a>
      )}
      <div className="border-y border-border py-2">
        <PostActions post={post} hasCommentLink={false} />
      </div>
    </article>
  );
}

function PostView() {
  const id = useSearchParams().get('id');
  const post = usePost(id);
  if (!id || post.data === null) return <EmptyState message={t.post.notFound} />;
  if (post.isError) return <ErrorState onRetry={() => void post.refetch()} />;
  if (!post.data) return <div className="flex justify-center py-16"><Spinner /></div>;
  return (
    <div className="mx-auto max-w-3xl">
      <PostDetails post={post.data} />
      <Comments postId={post.data.id} />
    </div>
  );
}

export default function PostPage() {
  return <Suspense><PostView /></Suspense>;
}
