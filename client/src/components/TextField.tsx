import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from '@/components/AppText';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  helper?: string;
  optional?: string;
}

export function TextField({ label, error, helper, optional, style, multiline, ...rest }: TextFieldProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText variant="label">
          {label}
          {optional ? <AppText variant="small"> · {optional}</AppText> : null}
        </AppText>
      ) : null}
      <TextInput
        placeholderTextColor={theme.textSecondary}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.multiline,
          { backgroundColor: theme.surface, borderColor: error ? theme.danger : theme.border, color: theme.text },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <AppText variant="small" color="danger">
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="small">{helper}</AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.xs },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: 16,
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
});
