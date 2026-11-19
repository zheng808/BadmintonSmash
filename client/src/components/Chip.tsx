import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ChipTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'primary';

export function Chip({ label, tone = 'neutral', style }: { label: string; tone?: ChipTone; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const colors = {
    neutral: { bg: theme.surfaceAlt, fg: theme.textSecondary },
    success: { bg: theme.successSoft, fg: theme.success },
    warning: { bg: theme.warningSoft, fg: theme.warning },
    danger: { bg: theme.dangerSoft, fg: theme.danger },
    info: { bg: theme.infoSoft, fg: theme.info },
    primary: { bg: theme.primary, fg: theme.primaryText },
  }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: colors.bg }, style]} accessibilityRole="text">
      <Text style={[styles.text, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: Spacing.sm + 2, paddingVertical: 3, borderRadius: Radius.pill, alignSelf: 'flex-start' },
  text: { fontSize: 13, fontWeight: '600' },
});
