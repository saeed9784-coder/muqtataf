'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, Spinner } from '@/components/States';
import { useTags } from '@/lib/queries';
import { t } from '@/lib/strings';

export default function TagsPage() {
  const tags = useTags();
  return (
    <>
      <PageHeader title={t.tags.title} subtitle={t.tags.subtitle} />
      {tags.isPending && <Spinner />}
      {tags.isError && <ErrorState onRetry={() => void tags.refetch()} />}
      <ul className="flex flex-wrap gap-2">
        {tags.data?.map((tag) => (
          <li key={tag.name}>
            <Link href={`/tag/?name=${encodeURIComponent(tag.name)}`} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 hover:border-muted/50">
              <span dir="ltr" className="font-medium">#{tag.name}</span>
              <span className="text-xs text-muted">{t.tags.posts(tag.posts)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
