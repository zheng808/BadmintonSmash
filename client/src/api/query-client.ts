import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (count, error) => {
        const status = (error as { status?: number }).status ?? 0;
        if (status >= 400 && status < 500) return false;
        return count < 2;
      },
    },
  },
});
