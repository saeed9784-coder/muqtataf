import { describe, expect, it } from 'vitest';
import { fetchFeed, parseFeedXml, readLimited } from './feed';
import { fetchOgImage, findOgImage } from './og-image';

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>Blog</title>
  <item>
    <title>Hello &amp; welcome</title>
    <link>https://blog.dev/hello</link>
    <pubDate>Mon, 05 Jan 2026 10:00:00 GMT</pubDate>
    <category>JavaScript</category><category>Web Dev</category>
    <media:content url="https://blog.dev/cover.png" medium="image"/>
    <description><![CDATA[<p>An <b>intro</b> post.</p>]]></description>
  </item>
  <item>
    <title>No image</title>
    <link>https://blog.dev/no-image</link>
    <content:encoded><![CDATA[<p>Body <img src="/inline.jpg"></p>]]></content:encoded>
  </item>
  <item><title>Duplicate</title><link>https://blog.dev/hello</link></item>
  <item><title>Bad link</title><link>javascript:alert(1)</link></item>
  <item><link>https://blog.dev/untitled</link></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
  <entry><title>Atom post</title><link href="https://atom.dev/p1"/><updated>2026-01-02T00:00:00Z</updated>
  <summary>Short summary</summary><category term="go"/></entry>
</feed>`;

const NOW = new Date('2026-02-01T00:00:00Z');

describe('parseFeedXml', () => {
  it('maps RSS items, dedupes by URL and drops unsafe or untitled items', async () => {
    const posts = await parseFeedXml(RSS, NOW);
    expect(posts.map((p) => p.url)).toEqual(['https://blog.dev/hello', 'https://blog.dev/no-image']);
    const [first, second] = posts;
    expect(first).toMatchObject({
      title: 'Hello & welcome',
      summary: 'An intro post.',
      image: 'https://blog.dev/cover.png',
      tags: ['javascript', 'web-dev'],
    });
    expect(first?.publishedAt.toISOString()).toBe('2026-01-05T10:00:00.000Z');
    expect(second?.image).toBe('https://blog.dev/inline.jpg');
    expect(second?.publishedAt).toBe(NOW);
  });

  it('parses Atom feeds', async () => {
    const [post] = await parseFeedXml(ATOM, NOW);
    expect(post).toMatchObject({ url: 'https://atom.dev/p1', title: 'Atom post', summary: 'Short summary' });
  });
});

const respond = (body: string, init: ResponseInit = {}) => async () => new Response(body, init);

describe('fetchFeed', () => {
  it('parses a successful response', async () => {
    const posts = await fetchFeed('https://blog.dev/feed', respond(RSS) as typeof fetch);
    expect(posts).toHaveLength(2);
  });
  it('throws on HTTP errors', async () => {
    await expect(fetchFeed('https://blog.dev/feed', respond('', { status: 503 }) as typeof fetch)).rejects.toThrow('503');
  });
});

describe('readLimited', () => {
  it('throws past the limit unless truncating', async () => {
    await expect(readLimited(new Response('x'.repeat(100)), 10)).rejects.toThrow('exceeded');
    const text = await readLimited(new Response('x'.repeat(100)), 10, true);
    expect(text.length).toBeLessThanOrEqual(100);
  });
});

describe('og:image', () => {
  it('finds og:image in either attribute order and resolves relative URLs', () => {
    expect(findOgImage('<meta property="og:image" content="/a.png">', 'https://x.dev/p')).toBe('https://x.dev/a.png');
    expect(findOgImage('<meta content="https://x.dev/b.png" name="twitter:image">', 'https://x.dev')).toBe('https://x.dev/b.png');
    expect(findOgImage('<title>none</title>', 'https://x.dev')).toBeNull();
  });
  it('returns null for non-HTML, errors and failures', async () => {
    const html = respond('<head><meta property="og:image" content="https://x.dev/c.png"></head>', {
      headers: { 'content-type': 'text/html' },
    });
    expect(await fetchOgImage('https://x.dev', html as typeof fetch)).toBe('https://x.dev/c.png');
    expect(await fetchOgImage('https://x.dev', respond('{}', { headers: { 'content-type': 'application/json' } }) as typeof fetch)).toBeNull();
    const failing = async () => {
      throw new Error('network');
    };
    expect(await fetchOgImage('https://x.dev', failing as typeof fetch)).toBeNull();
  });
});
