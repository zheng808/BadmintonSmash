import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { queryClient } from '@/api/query-client';
import { SessionProvider, useSession } from '@/auth/session';
import { Layout } from '@/components/Layout';
import { ToastProvider } from '@/components/Toast';
import { Spinner } from '@/components/ui';
import { EventDetailPage } from '@/pages/EventDetail';
import { EventEditPage, EventNewPage } from '@/pages/EventEdit';
import { ExplorePage } from '@/pages/Explore';
import { HomePage } from '@/pages/Home';
import { MoneyPage } from '@/pages/Money';
import { NotFoundPage } from '@/pages/NotFound';
import { ProfilePage } from '@/pages/Profile';
import { RosterPage } from '@/pages/Roster';
import { SettlePage } from '@/pages/Settle';
import { SignInPage } from '@/pages/SignIn';

function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const location = useLocation();
  if (session.status === 'loading') return <Spinner />;
  if (session.status === 'signedOut') {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/sign-in?redirect=${redirect}`} replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<RequireAuth><HomePage /></RequireAuth>} />
                <Route path="sign-in" element={<SignInPage />} />
                <Route path="explore" element={<ExplorePage />} />
                <Route path="events/new" element={<RequireAuth><EventNewPage /></RequireAuth>} />
                <Route path="e/:id" element={<EventDetailPage />} />
                <Route path="e/:id/edit" element={<RequireAuth><EventEditPage /></RequireAuth>} />
                <Route path="e/:id/roster" element={<RequireAuth><RosterPage /></RequireAuth>} />
                <Route path="e/:id/settle" element={<RequireAuth><SettlePage /></RequireAuth>} />
                <Route path="money" element={<RequireAuth><MoneyPage /></RequireAuth>} />
                <Route path="profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
