import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ScreenProps {
  children: ReactNode;
  /** Wrap in a ScrollView (default true). Use false for FlatList screens. */
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: ViewStyle;
  /** Extra bottom padding for floating buttons. */
  bottomInset?: number;
}

/** Full-height background with a centred column (max 840 px on web) and safe-area bottom padding. */
export function Screen({ children, scroll = true, padded = true, refreshing, onRefresh, style, bottomInset = 0 }: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const column = [styles.column, padded && styles.padded, { paddingBottom: insets.bottom + Spacing.lg + bottomInset }, style];

  if (!scroll) {
    return (
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={[styles.column, styles.fill, padded && styles.paddedH, style]}>{children}</View>
      </View>
    );
  }
  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.primary} /> : undefined}>
        <View style={column}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center' },
  column: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  padded: { padding: Spacing.md, gap: Spacing.md },
  paddedH: { paddingHorizontal: Spacing.md },
});
