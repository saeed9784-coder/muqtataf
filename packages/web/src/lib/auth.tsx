'use client';

import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadConfig, type AuthConfig } from './config';
import { setAuthHeaderProvider } from './gql';
import { t } from './strings';

export interface SessionUser {
  name: string;
  image: string | null;
}

interface AuthState {
  user: SessionUser | null;
  isReady: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const DEV_USER_KEY = 'muqtataf.devUser';
const CALLBACK_PATH = '/auth/callback/';

const AuthContext = createContext<AuthState | null>(null);

let managerPromise: Promise<UserManager | null> | null = null;

function createManager(auth: AuthConfig): UserManager {
  const origin = window.location.origin;
  return new UserManager({
    authority: `https://cognito-idp.${auth.region}.amazonaws.com/${auth.userPoolId}`,
    client_id: auth.clientId,
    redirect_uri: `${origin}${CALLBACK_PATH}`,
    post_logout_redirect_uri: `${origin}/`,
    response_type: 'code',
    scope: 'openid email profile',
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  });
}

/** null when running with local dev auth. */
export function getUserManager(): Promise<UserManager | null> {
  managerPromise ??= loadConfig()
    .then((config) => (config.auth ? createManager(config.auth) : null))
    .catch((error: unknown) => {
      managerPromise = null;
      throw error;
    });
  return managerPromise;
}

const readDevUser = (): string | null => {
  try {
    return window.localStorage.getItem(DEV_USER_KEY);
  } catch {
    return null;
  }
};

const toSessionUser = (user: User | null): SessionUser | null => {
  if (!user || user.expired) return null;
  const profile = user.profile;
  return { name: profile.name ?? profile.email?.split('@')[0] ?? '', image: profile.picture ?? null };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const unsubscribers: (() => void)[] = [];

    void getUserManager().then(async (manager) => {
      if (!manager) {
        const devName = readDevUser();
        setAuthHeaderProvider(async (): Promise<Record<string, string>> => {
          const name = readDevUser();
          return name ? { 'x-dev-user': name } : {};
        });
        if (isMounted) setUser(devName ? { name: devName, image: null } : null);
      } else {
        setAuthHeaderProvider(async (): Promise<Record<string, string>> => {
          const current = await manager.getUser();
          return current?.id_token && !current.expired ? { authorization: `Bearer ${current.id_token}` } : {};
        });
        const sync = (u: User | null): void => {
          if (isMounted) setUser(toSessionUser(u));
        };
        sync(await manager.getUser());
        const onLoaded = (u: User) => sync(u);
        const onUnloaded = () => sync(null);
        manager.events.addUserLoaded(onLoaded);
        manager.events.addUserUnloaded(onUnloaded);
        const onRenewError = () => void manager.removeUser();
        manager.events.addSilentRenewError(onRenewError);
        unsubscribers.push(
          () => manager.events.removeUserLoaded(onLoaded),
          () => manager.events.removeUserUnloaded(onUnloaded),
          () => manager.events.removeSilentRenewError(onRenewError),
        );
      }
      if (isMounted) setIsReady(true);
    }).catch(() => {
      // Config could not load: continue anonymously so pages still render (queries surface their own errors).
      setAuthHeaderProvider(async () => ({}));
      if (isMounted) setIsReady(true);
    });

    return () => {
      isMounted = false;
      unsubscribers.forEach((fn) => fn());
    };
  }, []);

  const signIn = useCallback(async () => {
    const manager = await getUserManager();
    if (manager) {
      await manager.signinRedirect({ state: window.location.pathname + window.location.search });
      return;
    }
    const name = window.prompt(t.auth.devPrompt, 'sara')?.trim();
    if (!name) return;
    window.localStorage.setItem(DEV_USER_KEY, name);
    window.location.reload();
  }, []);

  const signOut = useCallback(async () => {
    const [manager, config] = await Promise.all([getUserManager(), loadConfig()]);
    if (!manager || !config.auth) {
      window.localStorage.removeItem(DEV_USER_KEY);
      window.location.reload();
      return;
    }
    await manager.removeUser();
    // Cognito has no standard end_session_endpoint; use its /logout route.
    const params = new URLSearchParams({ client_id: config.auth.clientId, logout_uri: `${window.location.origin}/` });
    window.location.assign(`https://${config.auth.domain}/logout?${params}`);
  }, []);

  const value = useMemo(() => ({ user, isReady, signIn, signOut }), [user, isReady, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
