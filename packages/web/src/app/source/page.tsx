'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Feed } from '@/components/Feed';
import { FollowButton } from '@/components/FollowButton';
import { PageHeader } from '@/components/PageHeader';
import { SourceAvatar } from '@/components/SourceAvatar';
import { EmptyState } from '@/components/States';
import { useSource } from '@/lib/queries';
import { t } from '@/lib/strings';

function SourceView() {
  const id = useSearchParams().get('id');
  const source = useSource(id);
  if (!id || source.data === null) return <EmptyState message={t.feed.empty} />;
  return (
    <>
      <PageHeader
        icon={<SourceAvatar name={source.data?.name ?? id} image={source.data?.image ?? null} size="lg" />}
        title={<span dir="auto">{source.data?.name ?? '…'}</span>}
        subtitle={source.data && <a href={source.data.siteUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className="hover:text-text">{new URL(source.data.siteUrl).host}</a>}
        action={<FollowButton kind="SOURCE" value={id} />}
      />
      <Feed kind={{ type: 'SOURCE', sourceId: id }} />
    </>
  );
}

export default function SourcePage() {
  return <Suspense><SourceView /></Suspense>;
}
