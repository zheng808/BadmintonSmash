import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateLocale, useLocale } from '@/i18n';
import { isoToLocalDate, localDateToIso, nextRoundHour } from '@/lib/datetime';

export interface DateTimeFieldProps {
  label: string;
  /** ISO UTC instant. */
  value: string | undefined;
  /** IANA zone the wall time is entered in. */
  timezone: string;
  onChange: (iso: string | undefined) => void;
  error?: string;
  placeholder?: string;
}

/** Native implementation: iOS inline picker, Android date then time dialogs. Web uses DateTimeField.web.tsx. */
export function DateTimeField({ label, value, timezone, onChange, error, placeholder }: DateTimeFieldProps) {
  const theme = useTheme();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const date = value ? isoToLocalDate(value, timezone) : nextRoundHour();
  const display = value
    ? new Intl.DateTimeFormat(dateLocale(locale), { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(new Date(value))
    : placeholder ?? '—';

  const commit = (d: Date) => onChange(localDateToIso(d, timezone));

  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value: date,
      mode: 'date',
      onChange: (e: DateTimePickerEvent, picked?: Date) => {
        if (e.type !== 'set' || !picked) return;
        DateTimePickerAndroid.open({
          value: picked,
          mode: 'time',
          is24Hour: false,
          onChange: (e2: DateTimePickerEvent, withTime?: Date) => {
            if (e2.type === 'set' && withTime) commit(withTime);
          },
        });
      },
    });
  };

  return (
    <View style={styles.wrap}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display}`}
        onPress={() => (Platform.OS === 'android' ? openAndroid() : setOpen((v) => !v))}
        style={[styles.field, { backgroundColor: theme.surface, borderColor: error ? theme.danger : theme.border }]}>
        <AppText color={value ? 'text' : 'textSecondary'}>{display}</AppText>
      </Pressable>
      {open && Platform.OS === 'ios' ? (
        <DateTimePicker
          value={date}
          mode="datetime"
          display="inline"
          minuteInterval={5}
          onChange={(_e: DateTimePickerEvent, picked?: Date) => picked && commit(picked)}
        />
      ) : null}
      {error ? (
        <AppText variant="small" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  field: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, justifyContent: 'center' },
});
