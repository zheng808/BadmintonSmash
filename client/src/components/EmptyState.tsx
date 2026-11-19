import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Spacing } from '@/constants/theme';

export function EmptyState({ title, body, actionTitle, onAction }: { title: string; body?: string; actionTitle?: string; onAction?: () => void }) {
  return (
    <View style={styles.wrap}>
      <AppText variant="subheading" style={styles.center}>
        {title}
      </AppText>
      {body ? (
        <AppText variant="secondary" style={styles.center}>
          {body}
        </AppText>
      ) : null}
      {actionTitle && onAction ? <Button title={actionTitle} onPress={onAction} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: Spacing.xxl, paddingHorizontal: Spacing.lg, alignItems: 'center', gap: Spacing.md },
  center: { textAlign: 'center' },
});
