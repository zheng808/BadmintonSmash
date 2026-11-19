import { useLocalSearchParams } from 'expo-router';

import { useEvent, useMe } from '@/api/hooks';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EventForm } from '@/components/EventForm';
import { LoadingView } from '@/components/LoadingView';
import { Screen } from '@/components/Screen';
import { useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';

export default function EditEventScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useEvent(id);
  const me = useMe();
  return (
    <Screen>
      {q.isLoading ? <LoadingView /> : null}
      {q.isError ? <ErrorBanner message={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : null}
      {q.data && !q.data.me.isHost ? <EmptyState title={t.event.notFound} /> : null}
      {q.data?.me.isHost ? <EventForm mode="edit" initial={q.data.event} me={me.data} /> : null}
    </Screen>
  );
}
