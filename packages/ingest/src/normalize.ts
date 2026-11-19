import { createHash } from 'node:crypto';

export const MAX_SUMMARY_LENGTH = 400;
export const MAX_TITLE_LENGTH = 300;
export const MAX_TAGS_PER_POST = 6;
const WORDS_PER_MINUTE = 230;
/** Upper bound on HTML we scan per item; keeps hostile feeds from making ingestion slow. */
export const MAX_HTML_SCAN = 200_000;
const MAX_TAG_SCAN = 2_000;
const MIN_TAG_LENGTH = 2;
const MAX_TAG_LENGTH = 32;

const IGNORED_TAGS = new Set([
  'uncategorized', 'general', 'news', 'blog', 'post', 'posts', 'article', 'articles', 'featured', 'cc-by-sa', 'english',
]);
/** Feed-internal taxonomy prefixes (e.g. Stack Overflow's "se-tech"). */
const IGNORED_TAG_PREFIXES = ['se-'];

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const isHex = code[1]?.toLowerCase() === 'x';
      const value = Number.parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/**
 * Removes tags in a single linear pass. A regex like /<[^>]*>/g goes quadratic on input
 * such as many '<' with no '>', which a hostile feed could send.
 */
export function stripTags(html: string): string {
  let out = '';
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) return out + html.slice(i);
    out += `${html.slice(i, lt)} `;
    const gt = html.indexOf('>', lt + 1);
    if (gt === -1) return out;
    i = gt + 1;
  }
  return out;
}

/** Yields the opening tags named `name` (e.g. "img", "meta"), each capped in length. Linear in input size. */
export function* findTags(html: string, name: string): Generator<string> {
  const lower = html.toLowerCase();
  const needle = `<${name}`;
  let from = 0;
  for (;;) {
    const start = lower.indexOf(needle, from);
    if (start === -1) return;
    const end = lower.indexOf('>', start);
    if (end === -1) return;
    from = end + 1;
    const next = lower[start + needle.length];
    if (next && !/[\s/>]/.test(next)) continue; // e.g. <imgx>
    yield html.slice(start, Math.min(end + 1, start + MAX_TAG_SCAN));
  }
}

/** Reads one attribute from a single tag string (already length-capped). */
export function getAttr(tag: string, attr: string): string | null {
  const match = new RegExp(`\\s${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value === undefined ? null : decodeEntities(value);
}

/** Strips tags, decodes entities, collapses whitespace and truncates on a word boundary. */
export function cleanText(input: string | undefined | null, maxLength: number): string | null {
  if (!input) return null;
  const text = decodeEntities(stripTags(input.slice(0, MAX_HTML_SCAN))).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Returns the URL only if it is an absolute http(s) URL; blocks javascript:, data: and the like. */
export function safeHttpUrl(input: string | undefined | null, base?: string): string | null {
  if (!input) return null;
  try {
    const url = new URL(input.trim(), base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeTag(raw: string): string | null {
  const tag = decodeEntities(raw)
    .toLowerCase()
    .trim()
    .replace(/[\s_/]+/g, '-')
    .replace(/[^a-z0-9+#.-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  if (tag.length < MIN_TAG_LENGTH || tag.length > MAX_TAG_LENGTH || IGNORED_TAGS.has(tag)) return null;
  if (IGNORED_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix))) return null;
  return tag;
}

export function normalizeTags(raw: readonly unknown[] | undefined): string[] {
  const names = (raw ?? []).flatMap((value) => {
    if (typeof value === 'string') return [value];
    // rss-parser yields objects like { _: 'name', $: {...} } for some Atom feeds
    if (value && typeof value === 'object' && '_' in value && typeof value._ === 'string') return [value._];
    return [];
  });
  return [...new Set(names.map(normalizeTag).filter((t): t is string => t !== null))].slice(0, MAX_TAGS_PER_POST);
}

export function estimateReadTime(html: string | undefined | null): number | null {
  const text = cleanText(html, Number.MAX_SAFE_INTEGER);
  if (!text) return null;
  const words = text.split(' ').length;
  // Feeds that only carry an excerpt would give misleading 1-minute estimates.
  if (words < 150) return null;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Deterministic, URL-safe id so re-ingesting the same article never duplicates it. */
export function makePostId(url: string): string {
  return createHash('sha256').update(url).digest('base64url').slice(0, 14);
}

export function firstImageInHtml(html: string | undefined | null, base?: string): string | null {
  if (!html) return null;
  for (const tag of findTags(html.slice(0, MAX_HTML_SCAN), 'img')) {
    const src = safeHttpUrl(getAttr(tag, 'src'), base);
    if (src) return src;
  }
  return null;
}

export function clampDate(input: string | undefined, now: Date = new Date()): Date {
  const parsed = input ? new Date(input) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed > now) return now;
  return parsed;
}
