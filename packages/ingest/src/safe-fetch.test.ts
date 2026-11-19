import { describe, expect, it } from 'vitest';
import { isPublicHttpUrl, safeFetch } from './safe-fetch';

describe('isPublicHttpUrl', () => {
  it('allows public http(s) hosts on standard ports', () => {
    expect(isPublicHttpUrl('https://blog.dev/feed')).toBe(true);
    expect(isPublicHttpUrl('http://93.184.216.34/')).toBe(true);
  });
  it.each([
    'http://localhost/', 'http://127.0.0.1:9001/2018-06-01/runtime/invocation/next', 'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.5/', 'http://192.168.1.1/', 'http://172.20.0.1/', 'http://[::1]/', 'http://[fd00::1]/',
    'http://[::ffff:127.0.0.1]/', 'https://blog.dev:8443/', 'ftp://blog.dev/', 'https://user:pw@blog.dev/', 'http://intranet/',
  ])('blocks %s', (url) => {
    expect(isPublicHttpUrl(url)).toBe(false);
  });
});

describe('safeFetch', () => {
  it('re-checks redirect targets and blocks private hops', async () => {
    const fetchFn = (async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } })) as typeof fetch;
    await expect(safeFetch('https://blog.dev/x', {}, fetchFn)).rejects.toThrow('Blocked URL');
  });
  it('follows public redirects and stops after the limit', async () => {
    let calls = 0;
    const loop = (async () => {
      calls += 1;
      return new Response(null, { status: 301, headers: { location: `/next${calls}` } });
    }) as typeof fetch;
    await expect(safeFetch('https://blog.dev/x', {}, loop)).rejects.toThrow('Too many redirects');
    expect(calls).toBe(4);
  });
});
