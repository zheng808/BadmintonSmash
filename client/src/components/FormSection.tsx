import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Spacing } from '@/constants/theme';

export function FormSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <Card style={styles.card}>
      {title ? <AppText variant="subheading">{title}</AppText> : null}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({ card: { gap: Spacing.md } });
