import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextVariant = 'title' | 'heading' | 'subheading' | 'body' | 'bodyBold' | 'secondary' | 'small' | 'label' | 'mono';

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: ThemeColor;
}

export function AppText({ variant = 'body', color, style, ...rest }: AppTextProps) {
  const theme = useTheme();
  const defaultColor: ThemeColor = variant === 'secondary' || variant === 'small' || variant === 'label' ? 'textSecondary' : 'text';
  return <Text style={[{ color: theme[color ?? defaultColor], fontFamily: Fonts?.sans }, styles[variant], style]} {...rest} />;
}

const styles = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  subheading: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22 },
  bodyBold: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  secondary: { fontSize: 15, lineHeight: 20 },
  small: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  mono: { fontSize: 14, lineHeight: 20, fontFamily: Fonts?.mono },
});
