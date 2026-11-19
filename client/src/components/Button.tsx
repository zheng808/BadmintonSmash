import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, size = 'md', style, accessibilityLabel }: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const palette = {
    primary: { bg: theme.primary, fg: theme.primaryText, border: theme.primary },
    secondary: { bg: theme.surface, fg: theme.text, border: theme.border },
    destructive: { bg: theme.dangerSoft, fg: theme.danger, border: theme.dangerSoft },
    ghost: { bg: 'transparent', fg: theme.primary, border: 'transparent' },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.sm,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={palette.fg} /> : <Text style={[styles.text, size === 'sm' && styles.textSm, { color: palette.fg }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sm: { minHeight: 40, paddingHorizontal: Spacing.sm + 4 },
  text: { fontSize: 16, fontWeight: '600' },
  textSm: { fontSize: 14 },
});
