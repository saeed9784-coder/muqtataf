import { Feed } from '@/components/Feed';
import { PageHeader } from '@/components/PageHeader';
import { t } from '@/lib/strings';

export const metadata = { title: t.nav.latest };

export default function LatestPage() {
  return (
    <>
      <PageHeader title={t.nav.latest} />
      <Feed kind={{ type: 'LATEST' }} />
    </>
  );
}
