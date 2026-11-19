'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth';
import { GqlError } from '@/lib/gql';

const NO_RETRY_CODES = new Set(['UNAUTHENTICATED', 'BAD_USER_INPUT', 'NOT_FOUND']);
const MAX_RETRIES = 2;

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            refetchOnWindowFocus: false,
            retry: (count, error) => !(error instanceof GqlError && NO_RETRY_CODES.has(error.code ?? '')) && count < MAX_RETRIES,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
