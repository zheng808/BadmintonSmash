import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function AuthLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerTitle: '',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
    </Stack>
  );
}
