import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Spinner } from '@/components/Spinner';
import { Spacing } from '@/constants/theme';
import { useT } from '@/i18n';

export function LoadingView({ label }: { label?: string }) {
  const t = useT();
  return (
    <View style={styles.wrap}>
      <Spinner size="large" />
      <AppText variant="secondary">{label ?? t.common.loading}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { padding: Spacing.xxl, alignItems: 'center', gap: Spacing.md } });
