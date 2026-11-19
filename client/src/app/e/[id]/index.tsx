import {
  evaluateJoin,
  formatCents,
  formatEventRange,
  formatDateTime,
  isLateCancel,
  JOIN_REASON_TEXT,
  sortRoster,
  type Signup,
  type SignupPublic,
} from '@badmintonsmash/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { useEvent, useEventAction, useJoin, useLeave, useMoney, useUpdateMySignup } from '@/api/hooks';
import { isApiError } from '@/api/client';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useDialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { statusTone } from '@/components/EventCard';
import { LoadingView } from '@/components/LoadingView';
import { PaymentHandlesList } from '@/components/PaymentHandlesList';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateLocale, useLocale, useT } from '@/i18n';
import { env, eventShareUrl } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { buildRosterText } from '@/lib/rosterText';
import { shareLink } from '@/lib/share';

type RosterEntry = Signup | SignupPublic;

export default function EventDetailScreen() {
  const t = useT();
  const locale = useLocale();
  const theme = useTheme();
  const dialog = useDialog();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useEvent(id);
  const money = useMoney();
  const join = useJoin(id);
  const leave = useLeave(id);
  const action = useEventAction(id);
  const updateMine = useUpdateMySignup(id);
  const [note, setNote] = useState('');

  useEffect(() => {
    setNote(q.data?.me.signup?.note ?? '');
  }, [q.data?.me.signup?.note]);

  if (q.isLoading) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }
  if (q.isError || !q.data) {
    const notFound = isApiError(q.error, 'not_found');
    return (
      <Screen>
        {notFound ? <EmptyState title={t.event.notFound} actionTitle={t.common.goHome} onAction={() => router.replace('/')} /> : <ErrorBanner message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
      </Screen>
    );
  }

  const { event, roster, me, host, publicView } = q.data;
  const sorted = sortRoster<RosterEntry>(roster);
  const confirmed = sorted.filter((s) => s.status === 'confirmed');
  const waitlist = sorted.filter((s) => s.status === 'waitlisted');
  const mine = me.signup;
  const amSignedUp = mine?.status === 'confirmed' || mine?.status === 'waitlisted';
  const evaluation = evaluateJoin(event);
  const spotsPct = Math.min(1, event.confirmedCount / Math.max(1, event.capacity));
  const owed = money.data?.owed.find((o) => o.eventId === event.eventId);
  const busy = join.isPending || leave.isPending || action.isPending;
  const actionError = join.error ?? leave.error ?? action.error ?? updateMine.error;
  const settlementDone = !!event.settlement;
  const mapHref =
    event.venue.mapUrl ??
    (event.venue.lat !== undefined && event.venue.lng !== undefined
      ? `https://www.google.com/maps/search/?api=1&query=${event.venue.lat},${event.venue.lng}${event.venue.placeId ? `&query_place_id=${encodeURIComponent(event.venue.placeId)}` : ''}`
      : undefined);
  const canSettle = me.isHost && Date.now() >= Date.parse(event.startsAt) && event.status !== 'cancelled' && event.status !== 'draft';

  const feeText = (() => {
    const c = event.fee.currency;
    if (settlementDone && event.settlement) return t.event.feeFinalized(formatCents(event.settlement.perPlayerCents, c));
    if (event.fee.mode === 'fixed' && event.fee.fixedAmountCents !== undefined) return t.event.feeFixed(formatCents(event.fee.fixedAmountCents, c));
    if (event.fee.estimateCents !== undefined) return t.event.feeEstimate(formatCents(event.fee.estimateCents, c));
    return t.event.feeSettleAfter;
  })();

  const onJoin = () => join.mutate({}, { onSuccess: (r) => dialog.toast(r.position ? t.event.youAreWaitlisted(r.position) : t.event.youAreIn) });

  const onLeave = async () => {
    const late = mine?.status === 'confirmed' && isLateCancel(event);
    const ok = await dialog.confirm({ title: t.event.leave, message: late ? `${t.event.leaveConfirm}\n\n${t.event.lateCancelWarning}` : t.event.leaveConfirm, confirmLabel: t.event.leave, destructive: true });
    if (ok) leave.mutate();
  };

  const onCancelEvent = async () => {
    const ok = await dialog.confirm({ title: t.event.cancel, message: t.event.cancelConfirm, confirmLabel: t.event.cancel, destructive: true });
    if (!ok) return;
    const reason = await dialog.prompt({ title: t.event.cancelReason, confirmLabel: t.common.confirm });
    action.mutate({ action: 'cancel', body: { reason: reason?.trim() || undefined } });
  };

  const onShare = async () => {
    const outcome = await shareLink(eventShareUrl(event.eventId), event.title);
    if (outcome === 'copied') dialog.toast(t.common.copied);
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

  const primary = (() => {
    if (publicView) {
      return <Button title={t.auth.signInToJoin} onPress={() => router.push({ pathname: '/(auth)/sign-in', params: { redirect: `/e/${event.eventId}` } })} />;
    }
    if (amSignedUp) return <Button title={t.event.leave} variant="secondary" onPress={() => void onLeave()} loading={leave.isPending} disabled={busy} />;
    if (me.canJoin) return <Button title={evaluation.wouldWaitlist ? t.event.joinWaitlist : t.event.join} onPress={onJoin} loading={join.isPending} disabled={busy} />;
    const reason = me.cannotJoinReason ?? (evaluation.reason ? JOIN_REASON_TEXT[evaluation.reason] : undefined);
    return <Button title={evaluation.wouldWaitlist ? t.event.joinWaitlist : t.event.join} disabled accessibilityLabel={reason} />;
  })();
  const cannotJoinText = !publicView && !amSignedUp && !me.canJoin ? me.cannotJoinReason ?? (evaluation.reason ? JOIN_REASON_TEXT[evaluation.reason] : undefined) : undefined;

  return (
    <Screen>
      <Stack.Screen options={{ title: event.title }} />
      {actionError ? <ErrorBanner message={errorMessage(actionError)} /> : null}

      <View style={styles.headerBlock}>
        <View style={styles.chipRow}>
          {event.status !== 'open' ? <Chip label={t.event.status[event.status]} tone={statusTone(event.status)} /> : null}
          {mine?.status === 'confirmed' ? <Chip label={t.event.youAreIn} tone="success" /> : null}
          {mine?.status === 'waitlisted' && me.position ? <Chip label={t.event.youAreWaitlisted(me.position)} tone="info" /> : null}
        </View>
        <AppText variant="title">{event.title}</AppText>
        <AppText>{formatEventRange(event.startsAt, event.endsAt, event.timezone, dateLocale(locale))}</AppText>
        <AppText variant="secondary">
          {event.venue.name}
          {event.venue.address ? ` · ${event.venue.address}` : ''}
          {event.courts ? ` · ${t.event.courts(event.courts)}` : ''}
        </AppText>
        {mapHref ? <Button title={t.event.openMap} variant="ghost" size="sm" style={styles.inlineBtn} onPress={() => void Linking.openURL(mapHref)} /> : null}
        {event.signupClosesAt ? <AppText variant="small">{t.event.signupsClose(formatDateTime(event.signupClosesAt, event.timezone, dateLocale(locale)))}</AppText> : null}
        {event.cancelDeadlineHours ? <AppText variant="small">{t.event.cancelDeadline(event.cancelDeadlineHours)}</AppText> : null}
      </View>

      <Card>
        <View style={styles.rowBetween}>
          <AppText variant="bodyBold">{t.event.confirmedOf(event.confirmedCount, event.capacity)}</AppText>
          <AppText variant="secondary">{event.waitlistCount ? t.event.waitlisted(event.waitlistCount) : event.capacity > event.confirmedCount ? t.event.spotsLeft(event.capacity - event.confirmedCount) : t.event.full}</AppText>
        </View>
        <View style={[styles.bar, { backgroundColor: theme.surfaceAlt }]}>
          <View style={[styles.barFill, { width: `${spotsPct * 100}%`, backgroundColor: spotsPct >= 1 ? theme.warning : theme.primary }]} />
        </View>
        <AppText variant="secondary">{feeText}</AppText>
        {owed ? (
          <View style={styles.owedBlock}>
            <Chip
              label={owed.paymentStatus === 'paid' ? t.event.paid : owed.paymentStatus === 'waived' ? t.event.waived : owed.claimedPaidAt ? t.event.claimedPaid : t.event.youOwe(formatCents(owed.amountOwedCents, owed.currency))}
              tone={owed.paymentStatus === 'paid' ? 'success' : owed.paymentStatus === 'waived' ? 'neutral' : owed.claimedPaidAt ? 'info' : 'warning'}
            />
            {owed.paymentStatus === 'unpaid' && !owed.claimedPaidAt ? (
              <Button title={t.event.iPaid} variant="secondary" size="sm" loading={updateMine.isPending} onPress={() => updateMine.mutate({ claimedPaid: true }, { onSuccess: () => void money.refetch() })} />
            ) : null}
          </View>
        ) : null}
        {primary}
        {cannotJoinText ? <AppText variant="small">{cannotJoinText}</AppText> : null}
      </Card>

      {amSignedUp ? (
        <Card>
          <TextField label={t.event.yourNote} value={note} onChangeText={setNote} maxLength={200} optional={t.common.optional} placeholder={t.event.note} />
          {note !== (mine?.note ?? '') ? <Button title={t.common.save} size="sm" variant="secondary" loading={updateMine.isPending} onPress={() => updateMine.mutate({ note: note.trim() })} /> : null}
        </Card>
      ) : null}

      {event.description ? (
        <Card>
          <AppText variant="subheading">{t.event.description}</AppText>
          <AppText>{event.description}</AppText>
        </Card>
      ) : null}

      <Card>
        <AppText variant="small">{t.event.hostedBy}</AppText>
        <AppText variant="bodyBold">{host?.displayName ?? event.hostDisplayName}</AppText>
        {host ? <PaymentHandlesList handles={host.paymentHandles} title={t.event.paymentHandles} /> : null}
      </Card>

      {me.isHost ? (
        <Card>
          <AppText variant="subheading">{t.event.hostActions}</AppText>
          <View style={styles.toolbar}>
            {event.status === 'draft' ? <Button title={t.event.publish} size="sm" onPress={() => action.mutate({ action: 'publish' })} disabled={busy} /> : null}
            <Button title={t.event.edit} size="sm" variant="secondary" onPress={() => router.push({ pathname: '/e/[id]/edit', params: { id: event.eventId } })} />
            <Button title={t.event.rosterManage} size="sm" variant="secondary" onPress={() => router.push({ pathname: '/e/[id]/roster', params: { id: event.eventId } })} />
            {canSettle ? <Button title={settlementDone ? t.settle.refinalize : t.event.settle} size="sm" variant="secondary" onPress={() => router.push({ pathname: '/e/[id]/settle', params: { id: event.eventId } })} /> : null}
            {event.status === 'open' ? <Button title={t.event.closeSignups} size="sm" variant="secondary" onPress={() => action.mutate({ action: 'close' })} disabled={busy} /> : null}
            {event.status === 'closed' && Date.now() < Date.parse(event.startsAt) ? <Button title={t.event.reopenSignups} size="sm" variant="secondary" onPress={() => action.mutate({ action: 'reopen' })} disabled={busy} /> : null}
            {(event.status === 'open' || event.status === 'closed') && Date.now() >= Date.parse(event.startsAt) ? <Button title={t.event.complete} size="sm" variant="secondary" onPress={() => action.mutate({ action: 'complete' })} disabled={busy} /> : null}
            <Button title={t.event.duplicate} size="sm" variant="secondary" onPress={() => router.push({ pathname: '/events/new', params: { duplicateOf: event.eventId } })} />
            {event.status !== 'cancelled' && event.status !== 'completed' ? <Button title={t.event.cancel} size="sm" variant="destructive" onPress={() => void onCancelEvent()} disabled={busy} /> : null}
          </View>
        </Card>
      ) : null}

      <View style={styles.toolbar}>
        <Button title={t.event.share} size="sm" variant="secondary" onPress={() => void onShare()} />
        {!publicView ? <Button title={t.event.shareRoster} size="sm" variant="secondary" onPress={() => void onShareRoster()} /> : null}
      </View>

      <Card>
        <AppText variant="subheading">
          {t.event.roster} · {event.confirmedCount}/{event.capacity}
        </AppText>
        {publicView ? (
          <AppText variant="secondary">{t.event.publicCounts(event.confirmedCount, event.capacity, event.waitlistCount)}</AppText>
        ) : confirmed.length === 0 ? (
          <AppText variant="secondary">{t.roster.noPlayers}</AppText>
        ) : (
          confirmed.map((s, i) => <RosterLine key={s.userId} index={i + 1} entry={s} highlight={s.userId === mine?.userId} />)
        )}
        {!publicView && waitlist.length > 0 ? (
          <>
            <AppText variant="subheading" style={styles.sectionTop}>
              {t.event.waitlist} · {waitlist.length}
            </AppText>
            {waitlist.map((s, i) => (
              <RosterLine key={s.userId} index={i + 1} entry={s} highlight={s.userId === mine?.userId} />
            ))}
          </>
        ) : null}
      </Card>
      {env.devAuth ? <AppText variant="small">dev · {event.eventId}</AppText> : null}
    </Screen>
  );
}

function RosterLine({ index, entry, highlight }: { index: number; entry: RosterEntry; highlight: boolean }) {
  const theme = useTheme();
  const t = useT();
  const host = entry as Partial<Signup>;
  return (
    <View style={[styles.rosterLine, highlight && { backgroundColor: theme.surfaceAlt }]}>
      <AppText variant="secondary" style={styles.index}>
        {index}.
      </AppText>
      <AppText style={styles.flex} numberOfLines={1}>
        {entry.displayName}
      </AppText>
      {host.attended === false ? <Chip label={t.roster.noShow} tone="warning" /> : null}
      {host.paymentStatus === 'paid' ? <Chip label={t.event.paid} tone="success" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: { gap: Spacing.xs },
  chipRow: { flexDirection: 'row', gap: Spacing.xs, flexWrap: 'wrap' },
  inlineBtn: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  bar: { height: 8, borderRadius: Radius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: Radius.pill },
  owedBlock: { gap: Spacing.sm },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  sectionTop: { marginTop: Spacing.sm },
  rosterLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6, paddingHorizontal: Spacing.xs, borderRadius: Radius.sm },
  index: { width: 28, textAlign: 'right' },
  flex: { flex: 1 },
});
