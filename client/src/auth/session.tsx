import { Hub } from 'aws-amplify/utils';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setDevUserHeader, setUnauthorizedHandler } from '@/api/client';
import { queryClient } from '@/api/query-client';
import { configureAmplify } from '@/auth/amplify';
import { getSessionUserId, signOut as authSignOut } from '@/auth/auth';
import { loadDevUserId, saveDevUserId } from '@/auth/dev';
import { env } from '@/lib/env';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; userId: string };

interface SessionContextValue {
  session: SessionState;
  isDev: boolean;
  /** Re-read the current session (call after sign-in). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Dev-auth only: switch the simulated user. */
  setDevUser: (id: string) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (env.devAuth) {
      const id = await loadDevUserId();
      setDevUserHeader(id);
      setSession({ status: 'signedIn', userId: id });
      return;
    }
    const userId = await getSessionUserId();
    setSession(userId ? { status: 'signedIn', userId } : { status: 'signedOut' });
  }, []);

  const signOut = useCallback(async () => {
    if (!env.devAuth) {
      try {
        await authSignOut();
      } catch {
        // local sign-out still proceeds
      }
    }
    queryClient.clear();
    setSession({ status: 'signedOut' });
  }, []);

  const setDevUser = useCallback(async (id: string) => {
    const clean = id.trim() || env.devUser;
    await saveDevUserId(clean);
    setDevUserHeader(clean);
    queryClient.clear();
    setSession({ status: 'signedIn', userId: clean });
  }, []);

  useEffect(() => {
    configureAmplify();
    setUnauthorizedHandler(() => {
      queryClient.clear();
      setSession({ status: 'signedOut' });
    });
    void refresh();
    if (env.devAuth) return undefined;
    const stop = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn' || payload.event === 'signedOut' || payload.event === 'signInWithRedirect' || payload.event === 'tokenRefresh_failure') {
        void refresh();
      }
    });
    return () => {
      stop();
      setUnauthorizedHandler(undefined);
    };
  }, [refresh]);

  const value = useMemo<SessionContextValue>(
    () => ({ session, isDev: env.devAuth, refresh, signOut, setDevUser }),
    [session, refresh, signOut, setDevUser],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
