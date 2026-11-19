import { router, Tabs, usePathname } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/constants/theme';
import { useResponsive } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

type TabDef = { name: 'index' | 'explore' | 'money' | 'profile'; href: '/' | '/explore' | '/money' | '/profile'; label: string; glyph: string };

function TabGlyph({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ color, fontSize: 20, lineHeight: 24 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const t = useT();
  const theme = useTheme();
  const { isWide } = useResponsive();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const tabs: TabDef[] = [
    { name: 'index', href: '/', label: t.tabs.home, glyph: '⌂' },
    { name: 'explore', href: '/explore', label: t.tabs.explore, glyph: '◎' },
    { name: 'money', href: '/money', label: t.tabs.money, glyph: '$' },
    { name: 'profile', href: '/profile', label: t.tabs.profile, glyph: '●' },
  ];

  return (
    <View style={styles.row}>
      {isWide ? (
        <View style={[styles.rail, { backgroundColor: theme.rail, borderColor: theme.border, paddingTop: insets.top + Spacing.lg }]}>
          <AppText variant="heading" style={styles.brand}>
            {t.appName}
          </AppText>
          {tabs.map((tab) => {
            const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
            return (
              <Pressable
                key={tab.name}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => router.navigate(tab.href)}
                style={[styles.railItem, active && { backgroundColor: theme.surfaceAlt }]}>
                <TabGlyph glyph={tab.glyph} color={active ? theme.primary : theme.textSecondary} />
                <Text style={[styles.railLabel, { color: active ? theme.text : theme.textSecondary }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={styles.content}>
        <Tabs
          screenOptions={{
            headerStyle: { backgroundColor: theme.surface },
            headerShadowVisible: false,
            headerTintColor: theme.text,
            tabBarActiveTintColor: theme.primary,
            tabBarInactiveTintColor: theme.textSecondary,
            tabBarStyle: isWide ? { display: 'none' } : { backgroundColor: theme.surface, borderTopColor: theme.border },
            sceneStyle: { backgroundColor: theme.background },
          }}>
          {tabs.map((tab) => (
            <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label, tabBarIcon: ({ color }) => <TabGlyph glyph={tab.glyph} color={typeof color === "string" ? color : theme.text} /> }} />
          ))}
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  content: { flex: 1 },
  rail: { width: 220, borderRightWidth: 1, paddingHorizontal: Spacing.md, gap: Spacing.xs },
  brand: { paddingHorizontal: Spacing.sm, paddingBottom: Spacing.md },
  railItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm + 2, borderRadius: Radius.md },
  railLabel: { fontSize: 15, fontWeight: '600' },
});
