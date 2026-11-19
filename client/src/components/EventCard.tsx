import { formatCents, formatEventRange, spotsLeft, type EventSummary } from '@badmintonsmash/shared';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { Chip, type ChipTone } from '@/components/Chip';
import { Spacing } from '@/constants/theme';
import { dateLocale, useLocale, useT } from '@/i18n';

export function statusTone(status: EventSummary['status']): ChipTone {
  switch (status) {
    case 'open':
      return 'success';
    case 'closed':
      return 'warning';
    case 'cancelled':
      return 'danger';
    case 'completed':
      return 'info';
    case 'draft':
      return 'neutral';
  }
}

export function EventCard({ item }: { item: EventSummary }) {
  const t = useT();
  const locale = useLocale();
  const left = spotsLeft(item);
  const capacityText = left > 0 ? t.event.spotsLeft(left) : `${t.event.full}${item.waitlistCount ? ` · ${t.event.waitlisted(item.waitlistCount)}` : ''}`;
  const feeText =
    item.fee.mode === 'fixed' && item.fee.fixedAmountCents !== undefined
      ? t.event.feeFixed(formatCents(item.fee.fixedAmountCents, item.fee.currency))
      : item.fee.estimateCents !== undefined
        ? t.event.feeEstimate(formatCents(item.fee.estimateCents, item.fee.currency))
        : t.event.feeSettleAfter;

  return (
    <Card onPress={() => router.push({ pathname: '/e/[id]', params: { id: item.eventId } })}>
      <View style={styles.headerRow}>
        <AppText variant="subheading" style={styles.title} numberOfLines={2}>
          {item.title}
        </AppText>
        {item.status !== 'open' ? <Chip label={t.event.status[item.status]} tone={statusTone(item.status)} /> : null}
      </View>
      <AppText variant="secondary">{formatEventRange(item.startsAt, item.endsAt, item.timezone, dateLocale(locale))}</AppText>
      <AppText variant="secondary" numberOfLines={1}>
        {item.venue.name}
        {item.hostDisplayName ? ` · ${t.event.hostedBy} ${item.hostDisplayName}` : ''}
      </AppText>
      <View style={styles.chips}>
        <Chip label={capacityText} tone={left > 0 ? 'neutral' : 'warning'} />
        {item.mySignupStatus === 'confirmed' ? <Chip label={t.event.youAreIn} tone="success" /> : null}
        {item.mySignupStatus === 'waitlisted' ? <Chip label={t.event.waitlist} tone="info" /> : null}
        {item.myAmountOwedCents !== undefined && item.myAmountOwedCents > 0 ? (
          <Chip
            label={item.myPaymentStatus === 'paid' ? t.event.paid : item.myPaymentStatus === 'waived' ? t.event.waived : t.event.youOwe(formatCents(item.myAmountOwedCents, item.fee.currency))}
            tone={item.myPaymentStatus === 'paid' ? 'success' : item.myPaymentStatus === 'waived' ? 'neutral' : 'warning'}
          />
        ) : null}
      </View>
      <AppText variant="small">{feeText}</AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  title: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
});
