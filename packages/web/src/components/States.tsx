import type { ReactNode } from 'react';
import { t } from '@/lib/strings';

export function CardSkeletons({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-80 animate-pulse rounded-2xl border border-border bg-surface" aria-hidden="true" />
      ))}
    </>
  );
}

export function EmptyState({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-6 py-16 text-center text-muted">
      <p>{message}</p>
      {children}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 rounded-2xl border border-danger/40 px-6 py-12 text-center">
      <p>{t.errors.generic}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded-lg bg-surface-2 px-4 py-2 font-medium hover:bg-border">
          {t.errors.retry}
        </button>
      )}
    </div>
  );
}

export function Spinner() {
  return <span className="inline-block size-5 animate-spin rounded-full border-2 border-muted border-t-transparent" aria-hidden="true" />;
}
