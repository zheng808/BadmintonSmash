import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { oauthEnabled } from '@/auth/amplify';
import { describeAuthError, isWeChatBrowser, requestCode, signInWithGoogle, type CodeMode } from '@/auth/auth';
import { pendingDisplayName } from '@/auth/dev';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { Spacing } from '@/constants/theme';
import { useT } from '@/i18n';

export default function SignInScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ redirect?: string; email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [displayName, setDisplayName] = useState('');
  const [mode, setMode] = useState<CodeMode | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const inWeChat = isWeChatBrowser();
  const currentUrl = (globalThis as { location?: { href?: string } }).location?.href;
  const cleanEmail = email.trim().toLowerCase();

  const goToCode = (m: CodeMode) =>
    router.push({ pathname: '/(auth)/verify', params: { email: cleanEmail, mode: m, redirect: params.redirect ?? '' } });

  const sendCode = async () => {
    setError(undefined);
    setBusy(true);
    try {
      const m = await requestCode(cleanEmail);
      if (m === 'signin') {
        goToCode('signin');
        return;
      }
      setMode('signup'); // ask for a display name before entering the code
    } catch (e) {
      setError(describeAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const continueSignup = async () => {
    await pendingDisplayName.set(displayName.trim());
    goToCode('signup');
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <AppText variant="title">{t.appName}</AppText>
        <AppText variant="secondary">{t.auth.welcomeHint}</AppText>
      </View>
      {error ? <ErrorBanner message={error} /> : null}
      <TextField
        label={t.auth.email}
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setMode(undefined);
        }}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        onSubmitEditing={() => void sendCode()}
        editable={!busy}
      />
      {mode === 'signup' ? (
        <>
          <AppText variant="secondary">{t.auth.newAccountHint}</AppText>
          <TextField label={t.auth.displayName} value={displayName} onChangeText={setDisplayName} autoComplete="name" maxLength={40} autoFocus />
          <Button title={t.auth.continue} onPress={() => void continueSignup()} disabled={displayName.trim().length < 2} />
        </>
      ) : (
        <Button title={t.auth.sendCode} onPress={() => void sendCode()} loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(cleanEmail)} />
      )}

      {oauthEnabled && !inWeChat ? (
        <>
          <AppText variant="small" style={styles.center}>
            {t.auth.or}
          </AppText>
          <Button title={t.auth.google} variant="secondary" onPress={() => void signInWithGoogle().catch((e) => setError(describeAuthError(e)))} />
        </>
      ) : null}
      {oauthEnabled && inWeChat ? (
        <ErrorBanner
          tone="info"
          message={`请在 Safari 或 Chrome 中打开此页面以使用 Google 登录。\nOpen this page in Safari or Chrome to sign in with Google.${currentUrl ? `\n${currentUrl}` : ''}`}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingTop: Spacing.xxl, paddingBottom: Spacing.md, gap: Spacing.xs },
  center: { textAlign: 'center' },
});
