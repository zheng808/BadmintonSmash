import '@/polyfills';

import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useGlobalSearchParams, usePathname, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { queryClient } from '@/api/query-client';
import { SessionProvider, useSession } from '@/auth/session';
import { DialogProvider } from '@/components/Dialog';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { initLocale, useT } from '@/i18n';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <DialogProvider>
          <RootNavigator />
        </DialogProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}

function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.startsWith('/') && !value.startsWith('//') ? value : undefined;
}

function RootNavigator() {
  const scheme = useColorScheme();
  const theme = useTheme();
  const t = useT();
  const { session } = useSession();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const navState = useRootNavigationState();
  const params = useGlobalSearchParams<{ redirect?: string }>();

  useEffect(() => {
    void initLocale();
  }, []);

  useEffect(() => {
    if (session.status !== 'loading') SplashScreen.hideAsync().catch(() => undefined);
  }, [session.status]);

  // Auth gate (AC-11): signed-out users may only see auth screens and the public event page.
  useEffect(() => {
    if (session.status === 'loading' || !navState?.key) return;
    const segs = segments as string[];
    const first = segs[0];
    const inAuth = first === '(auth)';
    const isPublicEvent = first === 'e' && segs.length === 2;
    if (session.status === 'signedOut' && !inAuth && !isPublicEvent) {
      router.replace({ pathname: '/(auth)/sign-in', params: { redirect: pathname } });
    } else if (session.status === 'signedIn' && inAuth) {
      const target = safeRedirect(params.redirect) ?? '/';
      router.replace(target as never);
    }
  }, [session.status, segments, pathname, navState?.key, router, params.redirect]);

  const navTheme = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{
        ...navTheme,
        colors: { ...navTheme.colors, primary: theme.primary, background: theme.background, card: theme.surface, text: theme.text, border: theme.border },
      }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="events/new" options={{ title: t.form.newEvent, presentation: 'modal' }} />
        <Stack.Screen name="e/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: t.common.notFoundTitle }} />
      </Stack>
    </ThemeProvider>
  );
}
