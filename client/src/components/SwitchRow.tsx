import { StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function SwitchRow({ label, helper, value, onChange, disabled }: { label: string; helper?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <AppText>{label}</AppText>
        {helper ? <AppText variant="small">{helper}</AppText> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: theme.primary }} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, minHeight: 44 },
  text: { flex: 1, gap: 2 },
});
