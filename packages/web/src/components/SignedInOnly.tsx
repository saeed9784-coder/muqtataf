'use client';

import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { t } from '@/lib/strings';
import { EmptyState, Spinner } from './States';

/** Renders children for signed-in users, otherwise a sign-in prompt. */
export function SignedInOnly({ children }: { children: ReactNode }) {
  const { user, isReady, signIn } = useAuth();
  if (!isReady) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!user) {
    return (
      <EmptyState message={t.auth.required}>
        <button type="button" onClick={() => void signIn()} className="rounded-xl bg-text px-4 py-2 font-bold text-bg">
          {t.auth.signIn}
        </button>
      </EmptyState>
    );
  }
  return children;
}
