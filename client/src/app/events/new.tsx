import { useLocalSearchParams } from 'expo-router';

import { useEvent, useMe } from '@/api/hooks';
import { EventForm } from '@/components/EventForm';
import { LoadingView } from '@/components/LoadingView';
import { Screen } from '@/components/Screen';

export default function NewEventScreen() {
  const { duplicateOf } = useLocalSearchParams<{ duplicateOf?: string }>();
  const me = useMe();
  const source = useEvent(duplicateOf || undefined);
  if (duplicateOf && source.isLoading) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  return (
    <Screen>
      <EventForm mode="create" initial={source.data?.event} me={me.data} />
    </Screen>
  );
}
