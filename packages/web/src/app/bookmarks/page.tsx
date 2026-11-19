import { Feed } from '@/components/Feed';
import { PageHeader } from '@/components/PageHeader';
import { SignedInOnly } from '@/components/SignedInOnly';
import { t } from '@/lib/strings';

export const metadata = { title: t.nav.bookmarks };

export default function BookmarksPage() {
  return (
    <>
      <PageHeader title={t.nav.bookmarks} />
      <SignedInOnly>
        <Feed kind={{ type: 'BOOKMARKS' }} emptyMessage={t.feed.bookmarksEmpty} />
      </SignedInOnly>
    </>
  );
}
