import { router } from 'expo-router';

import { EmptyState } from '@/components/EmptyState';
import { Screen } from '@/components/Screen';
import { useT } from '@/i18n';

export default function NotFoundScreen() {
  const t = useT();
  return (
    <Screen>
      <EmptyState title={t.common.notFoundTitle} actionTitle={t.common.goHome} onAction={() => router.replace('/')} />
    </Screen>
  );
}
