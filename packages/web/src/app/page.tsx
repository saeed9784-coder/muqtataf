import { Feed } from '@/components/Feed';
import { PageHeader } from '@/components/PageHeader';
import { t } from '@/lib/strings';

export default function PopularPage() {
  return (
    <>
      <PageHeader title={t.nav.popular} />
      <Feed kind={{ type: 'POPULAR' }} />
    </>
  );
}
