'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { SourceAvatar } from '@/components/SourceAvatar';
import { ErrorState, Spinner } from '@/components/States';
import { useSources } from '@/lib/queries';
import { t } from '@/lib/strings';

export default function SourcesPage() {
  const sources = useSources();
  return (
    <>
      <PageHeader title={t.sources.title} subtitle={t.sources.subtitle} />
      {sources.isPending && <Spinner />}
      {sources.isError && <ErrorState onRetry={() => void sources.refetch()} />}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sources.data?.map((s) => (
          <li key={s.id}>
            <Link href={`/source/?id=${encodeURIComponent(s.id)}`} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 hover:border-muted/50">
              <SourceAvatar name={s.name} image={s.image} size="md" />
              <span className="font-medium" dir="auto">{s.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
