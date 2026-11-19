import { USER_AGENT, readLimited } from './feed';
import { safeFetch, type FetchFn } from './safe-fetch';
import { findTags, getAttr, safeHttpUrl } from './normalize';

const OG_TIMEOUT_MS = 4_000;
const MAX_HEAD_BYTES = 512 * 1024;

const IMAGE_KEYS = new Set(['og:image', 'og:image:url', 'twitter:image']);

export function findOgImage(html: string, pageUrl: string): string | null {
  for (const tag of findTags(html, 'meta')) {
    const key = (getAttr(tag, 'property') ?? getAttr(tag, 'name'))?.toLowerCase();
    if (key && IMAGE_KEYS.has(key)) {
      const url = safeHttpUrl(getAttr(tag, 'content'), pageUrl);
      if (url) return url;
    }
  }
  return null;
}

/** Best effort: any failure (timeout, non-HTML, too large) just yields null. */
export async function fetchOgImage(pageUrl: string, fetchFn: FetchFn = fetch): Promise<string | null> {
  try {
    const response = await safeFetch(pageUrl, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      signal: AbortSignal.timeout(OG_TIMEOUT_MS),
    }, fetchFn);
    if (!response.ok || !response.headers.get('content-type')?.includes('html')) return null;
    const html = await readLimited(response, MAX_HEAD_BYTES, true);
    const head = html.split(/<\/head>/i)[0] ?? html;
    return findOgImage(head, pageUrl);
  } catch {
    return null;
  }
}
