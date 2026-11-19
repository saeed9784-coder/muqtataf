import Link from 'next/link';
import { Feed } from '@/components/Feed';
import { PageHeader } from '@/components/PageHeader';
import { SignedInOnly } from '@/components/SignedInOnly';
import { t } from '@/lib/strings';

export const metadata = { title: t.nav.myFeed };

export default function MyFeedPage() {
  return (
    <>
      <PageHeader title={t.nav.myFeed} />
      <SignedInOnly>
        <Feed
          kind={{ type: 'MY' }}
          emptyMessage={t.feed.myEmpty}
          emptyAction={
            <div className="flex gap-3">
              <Link href="/tags/" className="rounded-lg bg-surface-2 px-4 py-2 text-text">{t.nav.tags}</Link>
              <Link href="/sources/" className="rounded-lg bg-surface-2 px-4 py-2 text-text">{t.nav.sources}</Link>
            </div>
          }
        />
      </SignedInOnly>
    </>
  );
}
