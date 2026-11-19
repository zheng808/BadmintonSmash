import { Currency, type Locale, type Profile, UpdateProfileInput } from '@badmintonsmash/shared';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDeleteMe, useMe, useUpdateMe } from '@/api/hooks';
import { useSession } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { useDialog } from '@/components/Dialog';
import { ErrorBanner } from '@/components/ErrorBanner';
import { FormSection } from '@/components/FormSection';
import { LoadingView } from '@/components/LoadingView';
import { MoneyField } from '@/components/MoneyField';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SwitchRow } from '@/components/SwitchRow';
import { TextField } from '@/components/TextField';
import { Spacing } from '@/constants/theme';
import { LOCALE_LABELS, setLocale, useLocale, useT } from '@/i18n';
import { env } from '@/lib/env';
import { errorMessage, issuesToFieldErrors } from '@/lib/errors';

type Handles = NonNullable<Profile['paymentHandles']>;
const HANDLE_KEYS = ['etransfer', 'wechat', 'alipay', 'venmo', 'zelle', 'paypal', 'other'] as const;

export default function ProfileScreen() {
  const t = useT();
  const locale = useLocale();
  const dialog = useDialog();
  const { session, signOut, isDev, setDevUser } = useSession();
  const me = useMe();
  const update = useUpdateMe();
  const del = useDeleteMe();

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [handles, setHandles] = useState<Handles>({});
  const [emailNonEssential, setEmailNonEssential] = useState(true);
  const [currency, setCurrency] = useState<Currency>('CAD');
  const [shuttleUnitCostCents, setShuttleUnitCostCents] = useState<number | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [devUser, setDevUserText] = useState(session.status === 'signedIn' ? session.userId : env.devUser);

  useEffect(() => {
    const p = me.data;
    if (!p) return;
    setDisplayName(p.displayName);
    setPhone(p.phone ?? '');
    setHandles(p.paymentHandles ?? {});
    setEmailNonEssential(p.notificationPrefs?.emailNonEssential ?? true);
    setCurrency(p.eventDefaults?.currency ?? 'CAD');
    setShuttleUnitCostCents(p.eventDefaults?.shuttleUnitCostCents);
    if (p.locale && p.locale !== locale) void setLocale(p.locale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data]);

  const save = () => {
    const cleanHandles: Handles = {};
    for (const k of HANDLE_KEYS) {
      const v = handles[k]?.trim();
      if (v) cleanHandles[k] = v;
    }
    const candidate = {
      displayName: displayName.trim(),
      phone: phone.trim() || undefined,
      locale,
      paymentHandles: cleanHandles,
      notificationPrefs: { emailNonEssential },
      eventDefaults: { currency, shuttleUnitCostCents, timezone: me.data?.eventDefaults?.timezone },
    };
    const parsed = UpdateProfileInput.safeParse(candidate);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    update.mutate(parsed.data, { onSuccess: () => dialog.toast(t.profile.saved) });
  };

  const changeLocale = (next: Locale) => {
    void setLocale(next);
    if (me.data) update.mutate({ displayName: me.data.displayName, locale: next, paymentHandles: me.data.paymentHandles });
  };

  const deleteAccount = async () => {
    const ok = await dialog.confirm({ title: t.auth.deleteAccount, message: t.auth.deleteConfirm, confirmLabel: t.auth.deleteAccount, destructive: true });
    if (!ok) return;
    del.mutate(undefined, { onSuccess: () => void signOut() });
  };

  if (me.isLoading) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    );
  }

  return (
    <Screen>
      {me.isError ? <ErrorBanner message={errorMessage(me.error)} onRetry={() => void me.refetch()} /> : null}
      {update.isError ? <ErrorBanner message={errorMessage(update.error)} /> : null}
      {del.isError ? <ErrorBanner message={errorMessage(del.error)} /> : null}

      <FormSection title={t.profile.title}>
        {me.data?.email ? <AppText variant="secondary">{me.data.email}</AppText> : null}
        <TextField label={t.auth.displayName} value={displayName} onChangeText={setDisplayName} error={errors.displayName} maxLength={40} />
        <TextField label={t.profile.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad" error={errors.phone} optional={t.common.optional} />
        <SegmentedControl
          label={t.profile.language}
          options={(['en', 'zh-CN'] as const).map((l) => ({ value: l, label: LOCALE_LABELS[l] }))}
          value={locale}
          onChange={changeLocale}
        />
      </FormSection>

      <FormSection title={t.profile.paymentHandles}>
        {HANDLE_KEYS.map((k) => (
          <TextField
            key={k}
            label={t.profile[k]}
            value={handles[k] ?? ''}
            onChangeText={(v) => setHandles((h) => ({ ...h, [k]: v }))}
            autoCapitalize="none"
            multiline={k === 'other'}
            optional={t.common.optional}
          />
        ))}
      </FormSection>

      <FormSection title={t.profile.notifications}>
        <SwitchRow label={t.profile.emailNonEssential} value={emailNonEssential} onChange={setEmailNonEssential} />
      </FormSection>

      <FormSection title={t.profile.defaults}>
        <SegmentedControl label={t.form.currency} options={Currency.options.map((c) => ({ value: c, label: c }))} value={currency} onChange={setCurrency} />
        <MoneyField label={t.profile.shuttleUnitCost} cents={shuttleUnitCostCents} onChangeCents={setShuttleUnitCostCents} currency={currency} />
      </FormSection>

      <Button title={t.common.save} onPress={save} loading={update.isPending} />

      <FormSection title={t.profile.account}>
        <Button title={t.auth.signOut} variant="secondary" onPress={() => void signOut()} />
        <Button title={t.auth.deleteAccount} variant="destructive" onPress={() => void deleteAccount()} loading={del.isPending} />
      </FormSection>

      {isDev ? (
        <FormSection title="Dev">
          <TextField label={t.profile.devUser} value={devUser} onChangeText={setDevUserText} autoCapitalize="none" />
          <View style={styles.row}>
            <Button title={t.profile.devSwitch} variant="secondary" size="sm" onPress={() => void setDevUser(devUser)} />
          </View>
        </FormSection>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: Spacing.sm } });
