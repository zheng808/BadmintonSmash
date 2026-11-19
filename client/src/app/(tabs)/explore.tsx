import type { EventSummary } from '@badmintonsmash/shared';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { usePublicEvents } from '@/api/hooks';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EventCard } from '@/components/EventCard';
import { LoadingView } from '@/components/LoadingView';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';

export default function ExploreScreen() {
  const t = useT();
  const theme = useTheme();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text]);
  const query = usePublicEvents(q);

  return (
    <Screen scroll={false}>
      <FlatList<EventSummary>
        data={query.data?.items ?? []}
        keyExtractor={(e) => e.eventId}
        renderItem={({ item }) => <EventCard item={item} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <TextField placeholder={t.explore.search} value={text} onChangeText={setText} autoCapitalize="none" returnKeyType="search" />
            {query.isError ? <ErrorBanner message={errorMessage(query.error)} onRetry={() => void query.refetch()} /> : null}
          </View>
        }
        ListEmptyComponent={query.isLoading ? <LoadingView /> : query.isError ? undefined : <EmptyState title={t.explore.empty} />}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={theme.primary} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.sm + 4, paddingTop: Spacing.md, paddingBottom: Spacing.xl },
  header: { gap: Spacing.md, paddingBottom: Spacing.xs },
});
