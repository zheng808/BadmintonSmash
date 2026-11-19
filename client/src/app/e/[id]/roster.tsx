import { formatCents, formatDateTime, formatEventRange, sortRoster, type PaymentStatus, type Signup } from '@badmintonsmash/shared';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { useAddSignup, useEvent, useHostUpdateSignup, useRemoveSignup } from '@/api/hooks';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useDialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { LoadingView } from '@/components/LoadingView';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateLocale, useLocale, useT } from '@/i18n';
import { eventShareUrl } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { buildRosterText } from '@/lib/rosterText';

function isHostView(s: Signup | { userId: string }): s is Signup {
  return 'partySize' in s;
}

export default function RosterScreen() {
  const t = useT();
  const locale = useLocale();
  const theme = useTheme();
  const dialog = useDialog();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useEvent(id);
  const hostUpdate = useHostUpdateSignup(id);
  const remove = useRemoveSignup(id);
  const add = useAddSignup(id);
  const [email, setEmail] = useState('');

  if (q.isLoading) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  if (q.isError || !q.data) {
    return (
      <Screen>
        <ErrorBanner message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      </Screen>
    );
  }
  const { event, roster, me } = q.data;
  if (!me.isHost) {
    return (
      <Screen>
        <EmptyState title={t.event.notFound} />
      </Screen>
    );
  }
  const signups = roster.filter(isHostView);
  const active = sortRoster(signups);
  const confirmed = active.filter((s) => s.status === 'confirmed');
  const waitlist = active.filter((s) => s.status === 'waitlisted');
  const gone = signups.filter((s) => s.status === 'cancelled' || s.status === 'removed').sort((a, b) => b.seq - a.seq);
  const currency = event.fee.currency;
  const mutationError = hostUpdate.error ?? remove.error ?? add.error;

  const setPayment = async (s: Signup) => {
    const choice = await dialog.choose<PaymentStatus>({
      title: t.roster.setPayment,
      message: `${s.displayName}${s.amountOwedCents !== undefined ? ` · ${formatCents(s.amountOwedCents, currency)}` : ''}`,
      options: [
        { value: 'paid', label: t.event.paid },
        { value: 'unpaid', label: t.event.unpaid },
        { value: 'waived', label: t.event.waived },
      ],
    });
    if (choice) hostUpdate.mutate({ userId: s.userId, input: { paymentStatus: choice } });
  };

  const onRemove = async (s: Signup) => {
    const reason = await dialog.prompt({ title: `${t.roster.remove}: ${s.displayName}`, label: t.roster.removeReason, confirmLabel: t.roster.remove, destructive: true });
    if (reason === undefined) return;
    remove.mutate({ userId: s.userId, input: { reason: reason.trim() || undefined } });
  };

  const onShareRoster = async () => {
    const text = buildRosterText({
      title: event.title,
      dateLine: formatEventRange(event.startsAt, event.endsAt, event.timezone, dateLocale(locale)),
      venueLine: event.venue.name,
      confirmed: confirmed.map((s) => s.displayName),
      waitlist: waitlist.map((s) => s.displayName),
      footer: eventShareUrl(event.eventId),
    });
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    if (nav?.clipboard && typeof document !== 'undefined') {
      await nav.clipboard.writeText(text);
      dialog.toast(t.common.copied);
      return;
    }
    const { Share } = await import('react-native');
    await Share.share({ message: text });
  };

  const paymentChip = (s: Signup) => {
    if (s.amountOwedCents === undefined) return null;
    const label = s.paymentStatus === 'paid' ? t.event.paid : s.paymentStatus === 'waived' ? t.event.waived : s.claimedPaidAt ? t.event.claimedPaid : t.event.unpaid;
    const tone = s.paymentStatus === 'paid' ? 'success' : s.paymentStatus === 'waived' ? 'neutral' : s.claimedPaidAt ? 'info' : 'warning';
    return <Chip label={`${formatCents(s.amountOwedCents, currency)} · ${label}`} tone={tone} />;
  };

  const Row = ({ s, index, showAttendance }: { s: Signup; index?: number; showAttendance: boolean }) => (
    <View style={[styles.row, { borderColor: theme.border }]}>
      <View style={styles.rowMain}>
        <AppText variant="bodyBold">
          {index !== undefined ? `${index}. ` : ''}
          {s.displayName}
        </AppText>
        <AppText variant="small">
          {t.roster.joined} {formatDateTime(s.joinedAt, event.timezone, dateLocale(locale))}
          {s.email ? ` · ${s.email}` : ''}
          {s.phone ? ` · ${s.phone}` : ''}
        </AppText>
        {s.note ? <AppText variant="small">“{s.note}”</AppText> : null}
        <View style={styles.chips}>
          {s.status === 'cancelled' ? <Chip label={t.roster.cancelled} /> : null}
          {s.status === 'removed' ? <Chip label={t.roster.removed} /> : null}
          {s.lateCancel ? <Chip label={t.roster.lateCancel} tone="warning" /> : null}
          {paymentChip(s)}
        </View>
      </View>
      <View style={styles.rowActions}>
        {showAttendance ? (
          <View style={styles.attendance}>
            <AppText variant="small">{s.attended === false ? t.roster.noShow : t.roster.attended}</AppText>
            <Switch value={s.attended !== false} onValueChange={(v) => hostUpdate.mutate({ userId: s.userId, input: { attended: v } })} trackColor={{ true: theme.primary }} accessibilityLabel={t.roster.attended} />
          </View>
        ) : null}
        {s.amountOwedCents !== undefined ? <Button title={t.roster.paymentStatus} size="sm" variant="secondary" onPress={() => void setPayment(s)} /> : null}
        {s.status === 'confirmed' || s.status === 'waitlisted' ? <Button title={t.roster.remove} size="sm" variant="destructive" onPress={() => void onRemove(s)} /> : null}
      </View>
    </View>
  );

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      {mutationError ? <ErrorBanner message={errorMessage(mutationError)} /> : null}
      <View style={styles.toolbar}>
        <Button title={t.event.shareRoster} size="sm" variant="secondary" onPress={() => void onShareRoster()} />
      </View>
      <Card>
        <AppText variant="subheading">{t.roster.addByEmail}</AppText>
        <View style={styles.addRow}>
          <View style={styles.flex}>
            <TextField value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="player@example.com" />
          </View>
          <Button title={t.roster.add} size="sm" loading={add.isPending} disabled={!email.includes('@')} onPress={() => add.mutate({ email: email.trim() }, { onSuccess: () => setEmail('') })} />
        </View>
      </Card>

      <Card>
        <AppText variant="subheading">
          {t.event.roster} · {event.confirmedCount}/{event.capacity}
        </AppText>
        {confirmed.length === 0 ? <AppText variant="secondary">{t.roster.noPlayers}</AppText> : confirmed.map((s, i) => <Row key={s.userId} s={s} index={i + 1} showAttendance />)}
      </Card>

      {waitlist.length > 0 ? (
        <Card>
          <AppText variant="subheading">
            {t.event.waitlist} · {waitlist.length}
          </AppText>
          {waitlist.map((s, i) => (
            <Row key={s.userId} s={s} index={i + 1} showAttendance={false} />
          ))}
        </Card>
      ) : null}

      {gone.length > 0 ? (
        <Card>
          <AppText variant="subheading">
            {t.roster.cancelled} / {t.roster.removed}
          </AppText>
          {gone.map((s) => (
            <Row key={s.userId} s={s} showAttendance={false} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  addRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
  row: { borderTopWidth: 1, paddingVertical: Spacing.sm + 2, gap: Spacing.sm },
  rowMain: { gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: 2 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, alignItems: 'center' },
  attendance: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.sm, borderRadius: Radius.md },
});
