import { seedSources, type Db, type SeedSource } from '@muqtataf/db';
import { createPgliteDb } from '@muqtataf/db/pglite';
import { savePosts, type ParsedPost } from '@muqtataf/ingest';
import { devAuthenticator } from './auth';
import { createApi } from './yoga';

export const TEST_SOURCES: SeedSource[] = [
  { id: 'alpha', name: 'Alpha Blog', siteUrl: 'https://alpha.dev', feedUrl: 'https://alpha.dev/feed' },
  { id: 'beta', name: 'Beta Blog', siteUrl: 'https://beta.dev', feedUrl: 'https://beta.dev/feed' },
];

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

export const makePost = (id: string, overrides: Partial<ParsedPost> = {}): ParsedPost => ({
  id,
  url: `https://alpha.dev/${id}`,
  title: `Post ${id}`,
  summary: `Summary for ${id}`,
  image: null,
  readTime: 4,
  publishedAt: hoursAgo(1),
  tags: [],
  ...overrides,
});

export async function setupApi() {
  const db: Db = await createPgliteDb();
  await seedSources(db, TEST_SOURCES);
  await savePosts(db, 'alpha', [
    makePost('p1', { title: 'Understanding React Server Components', tags: ['react', 'javascript'], publishedAt: hoursAgo(5) }),
    makePost('p2', { title: 'Rust ownership explained', tags: ['rust'], publishedAt: hoursAgo(2) }),
  ], { enrichImages: false });
  await savePosts(db, 'beta', [
    makePost('p3', { url: 'https://beta.dev/p3', title: 'Go generics in practice', tags: ['go'], publishedAt: hoursAgo(1) }),
    makePost('old', { url: 'https://beta.dev/old', title: 'An old React article', tags: ['react'], publishedAt: hoursAgo(24 * 40) }),
  ], { enrichImages: false });

  const api = createApi({ db, authenticate: devAuthenticator });

  const gql = async <T = Record<string, any>>(query: string, variables: Record<string, unknown> = {}, user?: string) => {
    const response = await api.fetch('http://test/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(user ? { 'x-dev-user': user } : {}) },
      body: JSON.stringify({ query, variables }),
    });
    return (await response.json()) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };
  };

  return { db, api, gql };
}
