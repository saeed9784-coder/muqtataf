import { describe, expect, it } from 'vitest';
import { clampDate, cleanText, decodeEntities, firstImageInHtml, stripTags, estimateReadTime, makePostId, normalizeTag, normalizeTags, safeHttpUrl } from './normalize';

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('a &amp; b &#8217; &#x2014; &hellip;')).toBe('a & b ’ — …');
  });
  it('leaves unknown or out-of-range entities alone', () => {
    expect(decodeEntities('&bogus; &#99999999;')).toBe('&bogus; &#99999999;');
  });
});

describe('cleanText', () => {
  it('strips tags and collapses whitespace', () => {
    expect(cleanText('<p>Hello\n  <b>world</b></p>', 100)).toBe('Hello world');
  });
  it('truncates on a word boundary with an ellipsis', () => {
    expect(cleanText('one two three four five six', 15)).toBe('one two three…');
  });
  it('returns null for empty input', () => {
    expect(cleanText('<p> </p>', 10)).toBeNull();
    expect(cleanText(undefined, 10)).toBeNull();
  });
});

describe('hostile HTML', () => {
  it('stays fast on many unclosed tags (no quadratic regex)', () => {
    const evil = '<'.repeat(1_000_000);
    const started = performance.now();
    cleanText(evil, 400);
    firstImageInHtml(`${'<img '.repeat(200_000)}`);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
  it('still finds images and strips normal tags', () => {
    expect(firstImageInHtml('<p><imgx src="/no.png"><IMG alt=x SRC=\'/a.png\'></p>', 'https://a.dev')).toBe('https://a.dev/a.png');
    expect(stripTags('a<b>b</b>c<unclosed')).toBe('a b c ');
  });
});

describe('safeHttpUrl', () => {
  it('accepts http(s) and resolves relative URLs against a base', () => {
    expect(safeHttpUrl('https://a.dev/x')).toBe('https://a.dev/x');
    expect(safeHttpUrl('/img.png', 'https://a.dev/post')).toBe('https://a.dev/img.png');
  });
  it('rejects dangerous or invalid schemes', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,hi')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
  });
});

describe('tags', () => {
  it('normalizes case, spaces and punctuation', () => {
    expect(normalizeTag('  Machine Learning ')).toBe('machine-learning');
    expect(normalizeTag('C#')).toBe('c#');
    expect(normalizeTag('Node.js')).toBe('node.js');
  });
  it('drops generic, too short or too long tags', () => {
    expect(normalizeTag('Uncategorized')).toBeNull();
    expect(normalizeTag('se-stackoverflow')).toBeNull();
    expect(normalizeTag('CC BY-SA')).toBeNull();
    expect(normalizeTag('x')).toBeNull();
    expect(normalizeTag('a'.repeat(40))).toBeNull();
  });
  it('dedupes, supports Atom category objects and caps the count', () => {
    const tags = normalizeTags(['React', 'react', { _: 'CSS' }, 42, 'a1', 'b1', 'c1', 'd1', 'e1']);
    expect(tags).toEqual(['react', 'css', 'a1', 'b1', 'c1', 'd1']);
  });
});

describe('estimateReadTime', () => {
  it('returns null for short excerpts and minutes for full articles', () => {
    expect(estimateReadTime('short text')).toBeNull();
    expect(estimateReadTime('word '.repeat(690))).toBe(3);
  });
});

describe('makePostId', () => {
  it('is deterministic and URL-safe', () => {
    const id = makePostId('https://a.dev/x');
    expect(id).toBe(makePostId('https://a.dev/x'));
    expect(id).toMatch(/^[A-Za-z0-9_-]{14}$/);
    expect(id).not.toBe(makePostId('https://a.dev/y'));
  });
});

describe('clampDate', () => {
  const now = new Date('2026-01-10T00:00:00Z');
  it('keeps valid past dates, clamps future and invalid ones to now', () => {
    expect(clampDate('2026-01-01T00:00:00Z', now).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(clampDate('2027-01-01', now)).toBe(now);
    expect(clampDate('garbage', now)).toBe(now);
    expect(clampDate(undefined, now)).toBe(now);
  });
});
