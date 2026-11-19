'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Feed } from '@/components/Feed';
import { FollowButton } from '@/components/FollowButton';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/States';
import { t } from '@/lib/strings';

function TagView() {
  const name = useSearchParams().get('name')?.trim().toLowerCase();
  if (!name) return <EmptyState message={t.feed.empty} />;
  return (
    <>
      <PageHeader title={<span dir="ltr">#{name}</span>} action={<FollowButton kind="TAG" value={name} />} />
      <Feed kind={{ type: 'TAG', tag: name }} />
    </>
  );
}

export default function TagPage() {
  return <Suspense><TagView /></Suspense>;
}
