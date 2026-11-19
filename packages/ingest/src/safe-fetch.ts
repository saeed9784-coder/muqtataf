import { isIP } from 'node:net';

export type FetchFn = typeof fetch;

const MAX_REDIRECTS = 3;
const ALLOWED_PORTS = new Set(['', '80', '443']);
const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

const PRIVATE_V4: [number, number][] = [
  [0x00000000, 8], [0x0a000000, 8], [0x7f000000, 8], [0xa9fe0000, 16],
  [0xac100000, 12], [0xc0a80000, 16], [0x64400000, 10], [0xe0000000, 4], [0xf0000000, 4],
];

function isPrivateV4(ip: string): boolean {
  const n = ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);
  return PRIVATE_V4.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
}

function isPrivateV6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped?.[1]) return isPrivateV4(mapped[1]);
  // URL() normalizes ::ffff:127.0.0.1 to the hex form ::ffff:7f00:1
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
  if (mappedHex?.[1] && mappedHex[2]) {
    const [hi, lo] = [Number.parseInt(mappedHex[1], 16), Number.parseInt(mappedHex[2], 16)];
    return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return /^(fc|fd|fe[89ab])/.test(v);
}

/**
 * Only public http(s) URLs on standard ports. Rejects loopback, private, link-local and
 * metadata addresses given as literals or well-known names. (Hostnames that *resolve* to
 * private IPs are not checked; the Lambdas run outside any VPC, which limits that exposure.)
 */
export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (!ALLOWED_PORTS.has(url.port) || url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.endsWith('.internal')) return false;
  const family = isIP(host);
  if (family === 4) return !isPrivateV4(host);
  if (family === 6) return !isPrivateV6(host);
  return host.includes('.');
}

/** fetch that refuses non-public targets and re-checks every redirect hop. */
export async function safeFetch(url: string, init: RequestInit, fetchFn: FetchFn = fetch): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!isPublicHttpUrl(current)) throw new Error(`Blocked URL: ${current}`);
    const response = await fetchFn(current, { ...init, redirect: 'manual' });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return response;
    await response.body?.cancel();
    current = new URL(location, current).toString();
  }
  throw new Error('Too many redirects');
}
