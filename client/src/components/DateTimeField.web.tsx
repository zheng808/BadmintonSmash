import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import type { DateTimeFieldProps } from '@/components/DateTimeField';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { inputValueToIso, isoToInputValue } from '@/lib/datetime';

/** Web implementation: the browser's native datetime-local control, interpreted in the event's time zone. */
export function DateTimeField({ label, value, timezone, onChange, error }: DateTimeFieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <AppText variant="label">{label}</AppText>
      <input
        type="datetime-local"
        aria-label={label}
        value={isoToInputValue(value, timezone)}
        step={300}
        onChange={(e) => onChange(e.target.value ? inputValueToIso(e.target.value, timezone) : undefined)}
        style={{
          minHeight: 48,
          boxSizing: 'border-box',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: error ? theme.danger : theme.border,
          borderRadius: Radius.md,
          paddingLeft: Spacing.md,
          paddingRight: Spacing.md,
          fontSize: 16,
          fontFamily: 'inherit',
          color: theme.text,
          backgroundColor: theme.surface,
          colorScheme: theme.background === '#0F1115' ? 'dark' : 'light',
        }}
      />
      {error ? (
        <AppText variant="small" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { gap: Spacing.xs } });
