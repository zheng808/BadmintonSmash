import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

export default function EventLayout() {
  const theme = useTheme();
  const t = useT();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="index" options={{ title: '' }} />
      <Stack.Screen name="edit" options={{ title: t.form.editEvent }} />
      <Stack.Screen name="roster" options={{ title: t.roster.title }} />
      <Stack.Screen name="settle" options={{ title: t.settle.title }} />
    </Stack>
  );
}
