import { computeSettlement, formatCents, selectPayers, SettlementInput, type PayerRule, type Signup } from '@badmintonsmash/shared';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useEvent, useFinalize, useMe, useSettlement } from '@/api/hooks';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { useDialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorBanner } from '@/components/ErrorBanner';
import { FormSection } from '@/components/FormSection';
import { LoadingView } from '@/components/LoadingView';
import { MoneyField } from '@/components/MoneyField';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SwitchRow } from '@/components/SwitchRow';
import { TextField } from '@/components/TextField';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { errorMessage, issuesToFieldErrors } from '@/lib/errors';

function isHostView(s: Signup | { userId: string }): s is Signup {
  return 'partySize' in s;
}

export default function SettleScreen() {
  const t = useT();
  const theme = useTheme();
  const dialog = useDialog();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useEvent(id);
  const me = useMe();
  const isHost = !!q.data?.me.isHost;
  const existing = useSettlement(id, isHost);
  const finalize = useFinalize(id);

  const [courtCostCents, setCourtCostCents] = useState<number | undefined>(0);
  const [shuttleCount, setShuttleCount] = useState('0');
  const [shuttleUnitCostCents, setShuttleUnitCostCents] = useState<number | undefined>();
  const [otherCostCents, setOtherCostCents] = useState<number | undefined>(0);
  const [otherLabel, setOtherLabel] = useState('');
  const [payers, setPayers] = useState<PayerRule>('attended');
  const [includeLateCancels, setIncludeLateCancels] = useState<string[]>([]);
  const [perPlayerOverrideCents, setPerPlayerOverrideCents] = useState<number | undefined>();
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [showOverrides, setShowOverrides] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [seeded, setSeeded] = useState(false);

  // Seed the form once from the existing settlement, else from the host's defaults.
  useEffect(() => {
    if (seeded || existing.isLoading) return;
    const s = existing.data;
    if (s) {
      setCourtCostCents(s.courtCostCents);
      setShuttleCount(String(s.shuttleCount));
      setShuttleUnitCostCents(s.shuttleUnitCostCents);
      setOtherCostCents(s.otherCostCents);
      setOtherLabel(s.otherLabel ?? '');
      setPayers(s.payers);
      setIncludeLateCancels(s.includeLateCancels);
      setPerPlayerOverrideCents(s.perPlayerOverrideCents);
      setOverrides(s.overrides);
      setShowOverrides(Object.keys(s.overrides).length > 0 || s.perPlayerOverrideCents !== undefined);
      setSeeded(true);
    } else if (me.data || me.isError) {
      setShuttleUnitCostCents(me.data?.eventDefaults?.shuttleUnitCostCents);
      setSeeded(true);
    }
  }, [seeded, existing.isLoading, existing.data, me.data, me.isError]);

  if (q.isLoading || (isHost && existing.isLoading)) {
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
  const { event, roster } = q.data;
  if (!isHost) {
    return (
      <Screen>
        <EmptyState title={t.event.notFound} />
      </Screen>
    );
  }
  const currency = event.fee.currency;
  const signups = roster.filter(isHostView);
  const canSettle = Date.now() >= Date.parse(event.startsAt) && event.status !== 'cancelled' && event.status !== 'draft';
  const lateCancels = signups.filter((s) => s.status === 'cancelled' && s.lateCancel);
  const payerIds = selectPayers(signups, payers, includeLateCancels);
  const shuttles = /^\d+$/.test(shuttleCount) ? Number(shuttleCount) : 0;
  const result = computeSettlement({
    courtCostCents: courtCostCents ?? 0,
    shuttleCount: shuttles,
    shuttleUnitCostCents: shuttleUnitCostCents ?? 0,
    otherCostCents: otherCostCents ?? 0,
    payerIds,
    perPlayerOverrideCents,
    overrides,
  });
  const byId = new Map(signups.map((s) => [s.userId, s]));

  const summary = signups.reduce(
    (acc, s) => {
      if (s.amountOwedCents === undefined) return acc;
      if (s.paymentStatus === 'paid') acc.collected += s.amountOwedCents;
      else if (s.paymentStatus === 'waived') acc.waived += s.amountOwedCents;
      else acc.outstanding += s.amountOwedCents;
      return acc;
    },
    { collected: 0, outstanding: 0, waived: 0 },
  );

  const buildInput = () => {
    const candidate = {
      courtCostCents: courtCostCents ?? 0,
      shuttleCount: shuttles,
      shuttleUnitCostCents: shuttleUnitCostCents ?? 0,
      otherCostCents: otherCostCents ?? 0,
      otherLabel: otherLabel.trim() || undefined,
      payers,
      includeLateCancels,
      perPlayerOverrideCents,
      overrides,
    };
    const parsed = SettlementInput.safeParse(candidate);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      return undefined;
    }
    setErrors({});
    return parsed.data;
  };

  const onFinalize = async () => {
    const input = buildInput();
    if (!input) return;
    if (payerIds.length === 0) {
      setErrors({ payers: t.settle.noPayers });
      return;
    }
    const ok = await dialog.confirm({ title: existing.data ? t.settle.refinalize : t.settle.finalize, message: t.settle.finalizeConfirm, confirmLabel: t.settle.finalize });
    if (!ok) return;
    finalize.mutate(input, {
      onSuccess: (r) => {
        setWarnings(r.warnings);
        dialog.toast(t.settle.finalized);
      },
    });
  };

  const toggleLateCancel = (userId: string) =>
    setIncludeLateCancels((prev) => (prev.includes(userId) ? prev.filter((u) => u !== userId) : [...prev, userId]));

  return (
    <Screen>
      {!canSettle ? <ErrorBanner tone="info" message={t.settle.notYet} /> : null}
      {finalize.isError ? <ErrorBanner message={errorMessage(finalize.error)} /> : null}
      {existing.data ? <Chip label={`${t.settle.finalized} · v${existing.data.version}`} tone="success" /> : null}

      <FormSection title={t.settle.title}>
        <MoneyField label={t.settle.courtCost} cents={courtCostCents} onChangeCents={setCourtCostCents} currency={currency} error={errors.courtCostCents} />
        <TextField label={t.settle.shuttles} value={shuttleCount} onChangeText={setShuttleCount} keyboardType="number-pad" error={errors.shuttleCount} />
        <MoneyField label={t.settle.shuttleUnitCost} cents={shuttleUnitCostCents} onChangeCents={setShuttleUnitCostCents} currency={currency} error={errors.shuttleUnitCostCents} />
        <MoneyField label={t.settle.other} cents={otherCostCents} onChangeCents={setOtherCostCents} currency={currency} optional={t.common.optional} />
        {otherCostCents ? <TextField label={t.settle.otherLabel} value={otherLabel} onChangeText={setOtherLabel} maxLength={80} /> : null}
      </FormSection>

      <FormSection title={t.settle.payers}>
        <SegmentedControl
          options={[
            { value: 'attended', label: t.settle.payersAttended },
            { value: 'confirmed', label: t.settle.payersConfirmed },
          ]}
          value={payers}
          onChange={setPayers}
        />
        {lateCancels.length > 0 ? (
          <View style={styles.gap}>
            <AppText variant="label">{t.settle.includeLateCancels}</AppText>
            {lateCancels.map((s) => (
              <SwitchRow key={s.userId} label={s.displayName} value={includeLateCancels.includes(s.userId)} onChange={() => toggleLateCancel(s.userId)} />
            ))}
          </View>
        ) : null}
        {errors.payers ? (
          <AppText variant="small" color="danger">
            {errors.payers}
          </AppText>
        ) : null}
      </FormSection>

      <Card>
        <AppText variant="subheading">{t.settle.preview}</AppText>
        <Line label={t.settle.total} value={formatCents(result.totalCents, currency)} />
        <Line label={t.settle.payerCount} value={String(result.payerCount)} />
        <Line label={t.settle.perPlayer} value={formatCents(result.perPlayerCents, currency)} strong />
        {result.surplusCents !== 0 ? (
          <Line label={result.surplusCents > 0 ? t.settle.surplus : t.settle.shortfall} value={formatCents(Math.abs(result.surplusCents), currency)} />
        ) : null}
        <SwitchRow label={t.settle.overrides} value={showOverrides} onChange={setShowOverrides} />
        {showOverrides ? (
          <View style={styles.gap}>
            <MoneyField label={t.settle.perPlayerOverride} cents={perPlayerOverrideCents} onChangeCents={setPerPlayerOverrideCents} currency={currency} optional={t.common.optional} />
            {payerIds.map((uid) => (
              <View key={uid} style={styles.overrideRow}>
                <AppText style={styles.flex} numberOfLines={1}>
                  {byId.get(uid)?.displayName ?? uid}
                </AppText>
                <View style={styles.overrideField}>
                  <MoneyField
                    cents={overrides[uid]}
                    onChangeCents={(v) =>
                      setOverrides((prev) => {
                        const next = { ...prev };
                        if (v === undefined) delete next[uid];
                        else next[uid] = v;
                        return next;
                      })
                    }
                    currency={currency}
                    placeholder={formatCents(result.perPlayerCents, currency)}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      <Button title={existing.data ? t.settle.refinalize : t.settle.finalize} onPress={() => void onFinalize()} loading={finalize.isPending} disabled={!canSettle} />

      {warnings.length > 0 ? (
        <Card>
          <AppText variant="subheading">{t.settle.warnings}</AppText>
          {warnings.map((w, i) => (
            <AppText key={i} variant="secondary">
              • {w}
            </AppText>
          ))}
        </Card>
      ) : null}

      {existing.data ? (
        <Card>
          <AppText variant="subheading">{t.settle.summary}</AppText>
          <Line label={t.settle.collected} value={formatCents(summary.collected, currency)} />
          <Line label={t.settle.outstanding} value={formatCents(summary.outstanding, currency)} />
          <Line label={t.settle.waived} value={formatCents(summary.waived, currency)} />
          {signups
            .filter((s) => s.amountOwedCents !== undefined)
            .map((s) => (
              <Pressable key={s.userId} style={[styles.payerRow, { borderColor: theme.border }]}>
                <AppText style={styles.flex}>{s.displayName}</AppText>
                <AppText variant="secondary">{formatCents(s.amountOwedCents ?? 0, currency)}</AppText>
                <Chip
                  label={s.paymentStatus === 'paid' ? t.event.paid : s.paymentStatus === 'waived' ? t.event.waived : s.claimedPaidAt ? t.event.claimedPaid : t.event.unpaid}
                  tone={s.paymentStatus === 'paid' ? 'success' : s.paymentStatus === 'waived' ? 'neutral' : s.claimedPaidAt ? 'info' : 'warning'}
                />
              </Pressable>
            ))}
        </Card>
      ) : null}
    </Screen>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <AppText variant="secondary">{label}</AppText>
      <AppText variant={strong ? 'heading' : 'bodyBold'}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: Spacing.sm },
  flex: { flex: 1 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  overrideRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  overrideField: { width: 140 },
  payerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderTopWidth: 1, paddingVertical: Spacing.sm },
});
