import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { describeAuthError, resendCode, submitCode, type CodeMode } from '@/auth/auth';
import { applyPendingDisplayName } from '@/auth/bootstrap';
import { useSession } from '@/auth/session';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { useDialog } from '@/components/Dialog';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useT } from '@/i18n';

export default function VerifyCodeScreen() {
  const t = useT();
  const dialog = useDialog();
  const { refresh } = useSession();
  const params = useLocalSearchParams<{ email?: string; mode?: string; redirect?: string }>();
  const email = (params.email ?? '').trim().toLowerCase();
  const [mode, setMode] = useState<CodeMode>(params.mode === 'signup' ? 'signup' : 'signin');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  if (!email) {
    // Declarative redirect: the imperative router is not available during static rendering.
    return <Redirect href={{ pathname: '/(auth)/sign-in', params: { redirect: params.redirect ?? '' } }} />;
  }

  const submit = async () => {
    setError(undefined);
    setBusy(true);
    try {
      const outcome = await submitCode(email, code.trim(), mode);
      if (outcome === 'code_required') {
        setMode('signin');
        setCode('');
        dialog.toast(t.auth.codeSentTo(email));
        return;
      }
      await applyPendingDisplayName();
      await refresh(); // the root gate redirects to `redirect` or home
    } catch (e) {
      setError(describeAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(undefined);
    try {
      await resendCode(email, mode);
      dialog.toast(t.auth.codeSentTo(email));
    } catch (e) {
      setError(describeAuthError(e));
    }
  };

  return (
    <Screen>
      <AppText variant="title">{t.auth.verify}</AppText>
      <AppText variant="secondary">{t.auth.codeSentTo(email)}</AppText>
      <AppText variant="small">{t.auth.verifyHint}</AppText>
      {error ? <ErrorBanner message={error} /> : null}
      <TextField
        label={t.auth.code}
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={8}
        autoFocus
        onSubmitEditing={() => void submit()}
      />
      <Button title={t.auth.continue} onPress={() => void submit()} loading={busy} disabled={code.trim().length < 4} />
      <Button title={t.auth.resendCode} variant="ghost" onPress={() => void resend()} disabled={busy} />
      <Button title={t.auth.changeEmail} variant="ghost" onPress={() => router.replace({ pathname: '/(auth)/sign-in', params: { email, redirect: params.redirect ?? '' } })} />
    </Screen>
  );
}
