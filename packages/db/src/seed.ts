import { sql } from 'drizzle-orm';
import type { Db } from './index';
import { sources } from './schema';

export interface SeedSource {
  id: string;
  name: string;
  siteUrl: string;
  feedUrl: string;
}

/** Initial English developer feeds. Add or disable rows in the `sources` table later. */
export const SEED_SOURCES: readonly SeedSource[] = [
  { id: 'devto', name: 'DEV Community', siteUrl: 'https://dev.to', feedUrl: 'https://dev.to/feed' },
  { id: 'freecodecamp', name: 'freeCodeCamp', siteUrl: 'https://www.freecodecamp.org/news', feedUrl: 'https://www.freecodecamp.org/news/rss/' },
  { id: 'css-tricks', name: 'CSS-Tricks', siteUrl: 'https://css-tricks.com', feedUrl: 'https://css-tricks.com/feed/' },
  { id: 'smashing', name: 'Smashing Magazine', siteUrl: 'https://www.smashingmagazine.com', feedUrl: 'https://www.smashingmagazine.com/feed/' },
  { id: 'github-blog', name: 'GitHub Blog', siteUrl: 'https://github.blog', feedUrl: 'https://github.blog/feed/' },
  { id: 'aws-news', name: 'AWS News Blog', siteUrl: 'https://aws.amazon.com/blogs/aws', feedUrl: 'https://aws.amazon.com/blogs/aws/feed/' },
  { id: 'martin-fowler', name: 'Martin Fowler', siteUrl: 'https://martinfowler.com', feedUrl: 'https://martinfowler.com/feed.atom' },
  { id: 'cloudflare', name: 'Cloudflare Blog', siteUrl: 'https://blog.cloudflare.com', feedUrl: 'https://blog.cloudflare.com/rss/' },
  { id: 'netflix-tech', name: 'Netflix TechBlog', siteUrl: 'https://netflixtechblog.com', feedUrl: 'https://netflixtechblog.com/feed' },
  { id: 'stackoverflow', name: 'Stack Overflow Blog', siteUrl: 'https://stackoverflow.blog', feedUrl: 'https://stackoverflow.blog/feed/' },
  { id: 'infoq', name: 'InfoQ', siteUrl: 'https://www.infoq.com', feedUrl: 'https://feed.infoq.com/' },
  { id: 'hacker-news', name: 'Hacker News', siteUrl: 'https://news.ycombinator.com', feedUrl: 'https://hnrss.org/frontpage' },
  { id: 'josh-comeau', name: 'Josh W. Comeau', siteUrl: 'https://www.joshwcomeau.com', feedUrl: 'https://www.joshwcomeau.com/rss.xml' },
  { id: 'overreacted', name: 'Overreacted', siteUrl: 'https://overreacted.io', feedUrl: 'https://overreacted.io/rss.xml' },
  { id: 'real-python', name: 'Real Python', siteUrl: 'https://realpython.com', feedUrl: 'https://realpython.com/atom.xml' },
  { id: 'rust-blog', name: 'Rust Blog', siteUrl: 'https://blog.rust-lang.org', feedUrl: 'https://blog.rust-lang.org/feed.xml' },
  { id: 'go-blog', name: 'The Go Blog', siteUrl: 'https://go.dev/blog', feedUrl: 'https://go.dev/blog/feed.atom' },
  { id: 'nodejs', name: 'Node.js Blog', siteUrl: 'https://nodejs.org', feedUrl: 'https://nodejs.org/en/feed/blog.xml' },
  { id: 'chrome-dev', name: 'Chrome for Developers', siteUrl: 'https://developer.chrome.com', feedUrl: 'https://developer.chrome.com/static/blog/feed.xml' },
  { id: 'mozilla-hacks', name: 'Mozilla Hacks', siteUrl: 'https://hacks.mozilla.org', feedUrl: 'https://hacks.mozilla.org/feed/' },
];

/** Idempotent: inserts new sources and refreshes name/URLs of existing ones. */
export async function seedSources(db: Db, list: readonly SeedSource[] = SEED_SOURCES): Promise<void> {
  if (list.length === 0) return;
  await db
    .insert(sources)
    .values(list.map((s) => ({ ...s, image: `${new URL(s.siteUrl).origin}/favicon.ico` })))
    .onConflictDoUpdate({
      target: sources.id,
      set: {
        name: sql`excluded.name`,
        siteUrl: sql`excluded.site_url`,
        feedUrl: sql`excluded.feed_url`,
      },
    });
}
