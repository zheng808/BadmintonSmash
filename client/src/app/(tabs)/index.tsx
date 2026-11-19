import type { EventScope, EventSummary } from '@badmintonsmash/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useEvents } from '@/api/hooks';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EventCard } from '@/components/EventCard';
import { LoadingView } from '@/components/LoadingView';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';

export default function HomeScreen() {
  const t = useT();
  const theme = useTheme();
  const [scope, setScope] = useState<EventScope>('upcoming');
  const q = useEvents(scope);
  const empty = { upcoming: t.home.emptyUpcoming, hosting: t.home.emptyHosting, past: t.home.emptyPast }[scope];

  return (
    <Screen scroll={false}>
      <FlatList<EventSummary>
        data={q.data?.items ?? []}
        keyExtractor={(e) => e.eventId}
        renderItem={({ item }) => <EventCard item={item} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <SegmentedControl
              options={[
                { value: 'upcoming', label: t.home.upcoming },
                { value: 'hosting', label: t.home.hosting },
                { value: 'past', label: t.home.past },
              ]}
              value={scope}
              onChange={setScope}
            />
            {q.isError ? <ErrorBanner message={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : null}
          </View>
        }
        ListEmptyComponent={q.isLoading ? <LoadingView /> : q.isError ? undefined : <EmptyState title={empty} />}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={theme.primary} />}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.home.newEvent}
        onPress={() => router.push('/events/new')}
        style={({ pressed }) => [styles.fab, { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 }]}>
        <Text style={[styles.fabText, { color: theme.primaryText }]}>＋ {t.home.newEvent}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.sm + 4, paddingTop: Spacing.md, paddingBottom: 110 },
  header: { gap: Spacing.md, paddingBottom: Spacing.xs },
  fab: { position: 'absolute', right: Spacing.md, bottom: Spacing.lg, minHeight: 52, paddingHorizontal: Spacing.lg, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  fabText: { fontSize: 16, fontWeight: '700' },
});
