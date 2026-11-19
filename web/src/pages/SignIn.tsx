import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { api } from '@/api/client';
import { oauthEnabled } from '@/auth/amplify';
import { authErrorKey, confirmEmailCode, isWeChatBrowser, resendEmailCode, signInWithGoogle, startEmailSignIn, type CodeMode } from '@/auth/auth';
import { useSession } from '@/auth/session';
import { useToast } from '@/components/Toast';
import { Banner, Button, Field } from '@/components/ui';
import { useT } from '@/i18n';

type Step = { kind: 'email' } | { kind: 'code'; mode: CodeMode };

export function SignInPage() {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { session, refresh } = useSession();
  const redirect = params.get('redirect') || '/';
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<Step>({ kind: 'email' });
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const inWeChat = isWeChatBrowser();

  useEffect(() => {
    if (session.status === 'signedIn') navigate(redirect, { replace: true });
  }, [session.status, navigate, redirect]);

  const fail = (e: unknown) => setError(t.auth.errors[authErrorKey(e)]);

  const finish = async () => {
    const name = displayName.trim();
    if (name.length >= 2) {
      try {
        await api.get('/me');
        await api.put('/me', { displayName: name });
      } catch {
        // the profile page lets the user set it later
      }
    }
    await refresh();
  };

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!addr) return;
    setError(undefined);
    setBusy(true);
    try {
      const r = await startEmailSignIn(addr);
      if (r.kind === 'done') await finish();
      else setStep({ kind: 'code', mode: r.mode });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    if (step.kind !== 'code') return;
    setError(undefined);
    setBusy(true);
    try {
      const r = await confirmEmailCode(email.trim().toLowerCase(), code.trim(), step.mode);
      if (r === 'done') {
        await finish();
      } else {
        setCode('');
        setStep({ kind: 'code', mode: 'signin' });
        toast(t.auth.codeSent);
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (step.kind !== 'code') return;
    setError(undefined);
    try {
      await resendEmailCode(email.trim().toLowerCase(), step.mode);
      toast(t.auth.codeSent);
    } catch (err) {
      fail(err);
    }
  };

  if (step.kind === 'code') {
    const isNew = step.mode === 'signup';
    return (
      <form className="stack" onSubmit={confirm}>
        <div className="hero">
          <h1>{t.auth.codeTitle}</h1>
          <p className="muted">{isNew ? t.auth.codeHintSignup(email.trim()) : t.auth.codeHintSignin(email.trim())}</p>
        </div>
        {error ? <Banner tone="error">{error}</Banner> : null}
        {isNew ? (
          <Field label={t.auth.displayName} hint={t.auth.displayNameHint}>
            <input className="input" value={displayName} maxLength={40} autoComplete="name" onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
        ) : null}
        <Field label={t.auth.code}>
          <input
            className="input"
            value={code}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            autoFocus
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Button type="submit" block loading={busy} disabled={code.length < 4 || (isNew && displayName.trim().length < 2)}>
          {t.auth.continueBtn}
        </Button>
        <div className="row between">
          <Button variant="ghost" small onClick={() => void resend()}>
            {t.auth.resendCode}
          </Button>
          <Button variant="ghost" small onClick={() => { setStep({ kind: 'email' }); setCode(''); setError(undefined); }}>
            {t.auth.useAnotherEmail}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form className="stack" onSubmit={sendCode}>
      <div className="hero">
        <h1>{t.appName}</h1>
        <p className="muted">{t.auth.emailHint}</p>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <Field label={t.auth.email}>
        <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" block loading={busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}>
        {t.auth.continueWithEmail}
      </Button>
      {oauthEnabled && !inWeChat ? (
        <>
          <div className="muted small" style={{ textAlign: 'center' }}>
            {t.auth.or}
          </div>
          <Button variant="secondary" block onClick={() => void signInWithGoogle().catch(fail)}>
            {t.auth.google}
          </Button>
        </>
      ) : null}
      {oauthEnabled && inWeChat ? <Banner>{t.auth.wechatNotice}</Banner> : null}
    </form>
  );
}
