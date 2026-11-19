export interface AuthConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  /** Cognito managed-login domain, e.g. muqtataf.auth.me-central-1.amazoncognito.com */
  domain: string;
}

export interface AppConfig {
  apiUrl: string;
  /** null means local dev auth (x-dev-user header). */
  auth: AuthConfig | null;
}

let cached: Promise<AppConfig> | null = null;

/** Runtime config written by CDK at deploy time (public/config.json locally). */
export function loadConfig(): Promise<AppConfig> {
  cached ??= fetch('/config.json', { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) throw new Error(`config.json responded ${res.status}`);
      return (await res.json()) as AppConfig;
    })
    .catch((error: unknown) => {
      cached = null; // allow a retry instead of caching the failure
      throw error;
    });
  return cached;
}
