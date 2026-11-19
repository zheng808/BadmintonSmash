import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>({ label, options, value, onChange }: { label?: string; options: readonly SegmentOption<T>[]; value: T; onChange: (v: T) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <View style={[styles.row, { backgroundColor: theme.surfaceAlt }]} accessibilityRole="radiogroup">
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(o.value)}
              style={[styles.segment, selected && { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.text, { color: selected ? theme.text : theme.textSecondary }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  row: { flexDirection: 'row', borderRadius: Radius.md, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm, borderWidth: 1, borderColor: 'transparent' },
  text: { fontSize: 14, fontWeight: '600' },
});
