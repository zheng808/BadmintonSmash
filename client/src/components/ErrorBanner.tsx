import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

export function ErrorBanner({ message, onRetry, tone = 'danger' }: { message: string; onRetry?: () => void; tone?: 'danger' | 'warning' | 'info' }) {
  const theme = useTheme();
  const t = useT();
  const bg = tone === 'danger' ? theme.dangerSoft : tone === 'warning' ? theme.warningSoft : theme.infoSoft;
  const fg = tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'info';
  return (
    <View style={[styles.wrap, { backgroundColor: bg }]} accessibilityRole="alert">
      <AppText color={fg} style={styles.text}>
        {message}
      </AppText>
      {onRetry ? <Button title={t.common.retry} onPress={onRetry} variant="secondary" size="sm" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  text: { flex: 1, minWidth: 160 },
});
