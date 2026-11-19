import type { PaymentHandles } from '@badmintonsmash/shared';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Spacing } from '@/constants/theme';
import { useT } from '@/i18n';

const KEYS = ['etransfer', 'wechat', 'alipay', 'venmo', 'zelle', 'paypal', 'other'] as const;

/** Host's payment handles as label/value rows (selectable text so they can be copied). */
export function PaymentHandlesList({ handles, title }: { handles: PaymentHandles | undefined; title?: string }) {
  const t = useT();
  const rows = KEYS.filter((k) => handles?.[k]);
  if (rows.length === 0) return null;
  return (
    <View style={styles.wrap}>
      {title ? <AppText variant="label">{title}</AppText> : null}
      {rows.map((k) => (
        <View key={k} style={styles.row}>
          <AppText variant="small" style={styles.label}>
            {t.profile[k]}
          </AppText>
          <AppText selectable style={styles.value}>
            {handles?.[k]}
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  row: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  label: { width: 120 },
  value: { flex: 1 },
});
