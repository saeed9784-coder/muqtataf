'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ErrorState, Spinner } from '@/components/States';
import { getUserManager } from '@/lib/auth';
import { t } from '@/lib/strings';

/** Only same-site relative paths; never redirect to another origin after sign-in. */
const safeReturnPath = (state: unknown): string => {
  if (typeof state !== 'string' || !state.startsWith('/')) return '/';
  try {
    const url = new URL(state, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search : '/';
  } catch {
    return '/';
  }
};

export default function AuthCallbackPage() {
  const router = useRouter();
  const [hasFailed, setHasFailed] = useState(false);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return; // React strict mode runs effects twice; the auth code is single-use.
    hasRun.current = true;
    void getUserManager()
      .then(async (manager) => {
        if (!manager) return router.replace('/');
        const user = await manager.signinRedirectCallback();
        // Full navigation so AuthProvider re-reads the stored session.
        window.location.replace(safeReturnPath(user.state));
      })
      .catch(() => setHasFailed(true));
  }, [router]);

  if (hasFailed) return <ErrorState onRetry={() => router.replace('/')} />;
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-muted">
      <Spinner />
      {t.auth.signingIn}
    </div>
  );
}
