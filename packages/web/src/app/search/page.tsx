'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Feed } from '@/components/Feed';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/States';
import { t } from '@/lib/strings';

const MIN_QUERY_LENGTH = 2;

function SearchView() {
  const query = useSearchParams().get('q')?.trim() ?? '';
  if (query.length < MIN_QUERY_LENGTH) return <EmptyState message={t.search.tooShort} />;
  return (
    <>
      <PageHeader title={t.search.title(query)} />
      <Feed kind={{ type: 'SEARCH', query }} />
    </>
  );
}

export default function SearchPage() {
  return <Suspense><SearchView /></Suspense>;
}
