import { formatCents, formatDateTime, type OwedItem, type OwedToMeItem, type Signup } from '@badmintonsmash/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { api } from '@/api/client';
import { useMoney } from '@/api/hooks';
import { keys } from '@/api/keys';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LoadingView } from '@/components/LoadingView';
import { PaymentHandlesList } from '@/components/PaymentHandlesList';
import { Screen } from '@/components/Screen';
import { Spacing } from '@/constants/theme';
import { dateLocale, useLocale, useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';

function OwedCard({ item }: { item: OwedItem }) {
  const t = useT();
  const locale = useLocale();
  const qc = useQueryClient();
  const claim = useMutation({
    mutationFn: () => api.patch<{ signup: Signup }>(`/events/${item.eventId}/signups/me`, { claimedPaid: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.money });
      void qc.invalidateQueries({ queryKey: keys.event(item.eventId) });
    },
  });
  const tone = item.paymentStatus === 'paid' ? 'success' : item.paymentStatus === 'waived' ? 'neutral' : item.claimedPaidAt ? 'info' : 'warning';
  const label = item.paymentStatus === 'paid' ? t.event.paid : item.paymentStatus === 'waived' ? t.event.waived : item.claimedPaidAt ? t.event.claimedPaid : t.event.unpaid;
  return (
    <Card onPress={() => router.push({ pathname: '/e/[id]', params: { id: item.eventId } })}>
      <View style={styles.rowBetween}>
        <AppText variant="subheading" style={styles.flex}>
          {item.title}
        </AppText>
        <AppText variant="heading">{formatCents(item.amountOwedCents, item.currency)}</AppText>
      </View>
      <AppText variant="secondary">
        {formatDateTime(item.startsAt, item.timezone, dateLocale(locale))} · {t.event.hostedBy} {item.hostDisplayName}
      </AppText>
      <Chip label={label} tone={tone} />
      {item.paymentStatus === 'unpaid' ? (
        <>
          <PaymentHandlesList handles={item.paymentHandles} />
          {!item.claimedPaidAt ? <Button title={t.event.iPaid} variant="secondary" size="sm" loading={claim.isPending} onPress={() => claim.mutate()} /> : null}
          {claim.isError ? <ErrorBanner message={errorMessage(claim.error)} /> : null}
        </>
      ) : null}
    </Card>
  );
}

function OwedToMeCard({ item }: { item: OwedToMeItem }) {
  const t = useT();
  const locale = useLocale();
  return (
    <Card onPress={() => router.push({ pathname: '/e/[id]/roster', params: { id: item.eventId } })}>
      <AppText variant="subheading">{item.title}</AppText>
      <AppText variant="secondary">{formatDateTime(item.startsAt, item.timezone, dateLocale(locale))}</AppText>
      <View style={styles.stats}>
        <Stat label={t.settle.collected} value={formatCents(item.collectedCents, item.currency)} />
        <Stat label={t.settle.outstanding} value={formatCents(item.outstandingCents, item.currency)} />
        <Stat label={t.settle.waived} value={formatCents(item.waivedCents, item.currency)} />
      </View>
      <AppText variant="small">{t.money.paidCount(item.paidCount, item.unpaidCount)}</AppText>
    </Card>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="small">{label}</AppText>
      <AppText variant="bodyBold">{value}</AppText>
    </View>
  );
}

export default function MoneyScreen() {
  const t = useT();
  const q = useMoney();
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {q.isLoading ? <LoadingView /> : null}
      {q.isError ? <ErrorBanner message={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : null}
      {q.data ? (
        <>
          <AppText variant="heading">{t.money.youOwe}</AppText>
          {q.data.owed.length === 0 ? <EmptyState title={t.money.emptyOwe} /> : q.data.owed.map((item) => <OwedCard key={item.eventId} item={item} />)}
          <AppText variant="heading" style={styles.sectionTop}>
            {t.money.owedToYou}
          </AppText>
          {q.data.owedToMe.length === 0 ? <EmptyState title={t.money.emptyOwed} /> : q.data.owedToMe.map((item) => <OwedToMeCard key={item.eventId} item={item} />)}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  flex: { flex: 1 },
  stats: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  stat: { minWidth: 90, gap: 2 },
  sectionTop: { marginTop: Spacing.md },
});
