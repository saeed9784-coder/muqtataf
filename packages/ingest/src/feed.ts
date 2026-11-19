import Parser from 'rss-parser';
import { safeFetch, type FetchFn } from './safe-fetch';
import {
  MAX_SUMMARY_LENGTH,
  MAX_TITLE_LENGTH,
  clampDate,
  cleanText,
  estimateReadTime,
  firstImageInHtml,
  makePostId,
  normalizeTags,
  safeHttpUrl,
} from './normalize';

export const USER_AGENT = 'MuqtatafBot/1.0 (+news aggregator)';
export const FEED_TIMEOUT_MS = 10_000;
export const MAX_FEED_BYTES = 5 * 1024 * 1024;
export const MAX_ITEMS_PER_FEED = 30;

interface MediaNode {
  $?: { url?: string; medium?: string; type?: string };
}

export interface FeedItem extends Parser.Item {
  'content:encoded'?: string;
  mediaContent?: MediaNode[];
  mediaThumbnail?: MediaNode;
  summary?: string;
}

export interface ParsedPost {
  id: string;
  url: string;
  title: string;
  summary: string | null;
  image: string | null;
  readTime: number | null;
  publishedAt: Date;
  tags: string[];
}

const parser: Parser<Record<string, unknown>, FeedItem> = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail'],
      ['summary', 'summary'],
    ],
  },
});

const isImageMedia = (node: MediaNode): boolean =>
  node.$?.medium === 'image' || Boolean(node.$?.type?.startsWith('image/')) || (!node.$?.medium && !node.$?.type);

export function extractImage(item: FeedItem): string | null {
  const base = item.link;
  const media = item.mediaContent?.find(isImageMedia)?.$?.url;
  const enclosure = item.enclosure?.type?.startsWith('image/') ? item.enclosure.url : undefined;
  return (
    safeHttpUrl(media, base) ??
    safeHttpUrl(item.mediaThumbnail?.$?.url, base) ??
    safeHttpUrl(enclosure, base) ??
    firstImageInHtml(item['content:encoded'] ?? item.content, base)
  );
}

export function mapItem(item: FeedItem, now: Date = new Date()): ParsedPost | null {
  const url = safeHttpUrl(item.link);
  const title = cleanText(item.title, MAX_TITLE_LENGTH);
  if (!url || !title) return null;
  const body = item['content:encoded'] ?? item.content;
  return {
    id: makePostId(url),
    url,
    title,
    summary: cleanText(item.contentSnippet ?? item.summary ?? body, MAX_SUMMARY_LENGTH),
    image: extractImage(item),
    readTime: estimateReadTime(body),
    publishedAt: clampDate(item.isoDate ?? item.pubDate, now),
    tags: normalizeTags(item.categories),
  };
}

export async function parseFeedXml(xml: string, now: Date = new Date()): Promise<ParsedPost[]> {
  const feed = await parser.parseString(xml);
  const seen = new Set<string>();
  return feed.items
    .map((item) => mapItem(item, now))
    .filter((post): post is ParsedPost => {
      if (!post || seen.has(post.url)) return false;
      seen.add(post.url);
      return true;
    })
    .slice(0, MAX_ITEMS_PER_FEED);
}

/**
 * Reads a response body as text. Past maxBytes it either throws, or with truncate
 * returns what it has read so far.
 */
export async function readLimited(response: Response, maxBytes: number, truncate = false): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      if (truncate) return text + decoder.decode();
      throw new Error(`Response exceeded ${maxBytes} bytes`);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export type { FetchFn };

export async function fetchFeed(feedUrl: string, fetchFn: FetchFn = fetch): Promise<ParsedPost[]> {
  const response = await safeFetch(feedUrl, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' },
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
  }, fetchFn);
  if (!response.ok) throw new Error(`Feed responded ${response.status}`);
  return parseFeedXml(await readLimited(response, MAX_FEED_BYTES));
}
