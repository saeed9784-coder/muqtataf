import { loadConfig } from './config';

export class GqlError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
    this.name = 'GqlError';
  }
}

type HeaderProvider = () => Promise<Record<string, string>>;

let authHeaders: HeaderProvider = async () => ({});
let markAuthReady: () => void = () => {};
/** Requests wait for this, so a signed-in user's first queries are never sent anonymously. */
const authReady = new Promise<void>((resolve) => {
  markAuthReady = resolve;
});

/** Registered by AuthProvider so every request carries the current token. */
export function setAuthHeaderProvider(provider: HeaderProvider): void {
  authHeaders = provider;
  markAuthReady();
}

interface GqlResponse<T> {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
}

export async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const [{ apiUrl }] = await Promise.all([loadConfig(), authReady]);
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json().catch(() => ({}))) as GqlResponse<T>;
  const [error] = body.errors ?? [];
  if (error) throw new GqlError(error.message, error.extensions?.code);
  if (!res.ok || !body.data) throw new GqlError(`HTTP ${res.status}`, undefined);
  return body.data;
}
