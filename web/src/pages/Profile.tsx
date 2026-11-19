import { UpdateProfileInput, type PaymentHandles, type Profile } from '@badmintonsmash/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useDeleteMe, useMe, useUpdateProfile } from '@/api/hooks';
import { useSession } from '@/auth/session';
import { useToast } from '@/components/Toast';
import { Banner, Button, Card, Check, Field, Spinner } from '@/components/ui';
import { LOCALE_LABELS, profileLocale, setLocale, useLocale, useT, type UiLocale } from '@/i18n';
import { errorMessage, issuesToFieldErrors } from '@/lib/errors';

const HANDLE_KEYS: (keyof PaymentHandles)[] = ['etransfer', 'wechat', 'alipay', 'paypal', 'venmo', 'zelle', 'other'];

interface FormState {
  displayName: string;
  phone: string;
  handles: Record<keyof PaymentHandles, string>;
  emailNonEssential: boolean;
}

function fromProfile(p: Profile): FormState {
  const handles = Object.fromEntries(HANDLE_KEYS.map((k) => [k, p.paymentHandles[k] ?? ''])) as Record<keyof PaymentHandles, string>;
  return { displayName: p.displayName, phone: p.phone ?? '', handles, emailNonEssential: p.notificationPrefs.emailNonEssential };
}

export function ProfilePage() {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const navigate = useNavigate();
  const { signOut } = useSession();
  const me = useMe();
  const update = useUpdateProfile();
  const del = useDeleteMe();
  const [s, setS] = useState<FormState | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (me.data && !s) setS(fromProfile(me.data));
  }, [me.data, s]);

  if (me.isPending || !s) return me.error ? <Banner tone="error">{errorMessage(me.error)}</Banner> : <Spinner />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const handles: PaymentHandles = {};
    for (const k of HANDLE_KEYS) {
      const v = s.handles[k].trim();
      if (v) handles[k] = v;
    }
    const parsed = UpdateProfileInput.safeParse({
      displayName: s.displayName,
      phone: s.phone.trim() || undefined,
      locale: profileLocale(locale),
      paymentHandles: handles,
      notificationPrefs: { emailNonEssential: s.emailNonEssential },
    });
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    update.mutate(parsed.data, { onSuccess: () => toast(t.profile.saved) });
  };

  const changeLocale = (next: UiLocale) => {
    setLocale(next);
    if (me.data) update.mutate({ displayName: me.data.displayName, locale: profileLocale(next) });
  };

  const remove = () => {
    if (!window.confirm(t.auth.deleteConfirm)) return;
    del.mutate(undefined, {
      onSuccess: () => {
        void signOut().then(() => navigate('/sign-in', { replace: true }));
      },
    });
  };

  return (
    <form className="stack" onSubmit={submit}>
      <h1>{t.profile.title}</h1>
      {me.data ? <p className="muted small">{t.profile.signedInAs(me.data.email)}</p> : null}
      {update.error ? <Banner tone="error">{errorMessage(update.error)}</Banner> : null}
      <Card>
        <Field label={t.profile.displayName} error={errors.displayName}>
          <input className="input" value={s.displayName} maxLength={40} onChange={(e) => setS({ ...s, displayName: e.target.value })} />
        </Field>
        <Field label={t.profile.phone} hint={t.profile.phoneHint} optional={t.common.optional} error={errors.phone}>
          <input className="input" type="tel" value={s.phone} maxLength={30} onChange={(e) => setS({ ...s, phone: e.target.value })} />
        </Field>
        <Field label={t.profile.language}>
          <select className="input" value={locale} onChange={(e) => changeLocale(e.target.value as UiLocale)}>
            {(Object.keys(LOCALE_LABELS) as UiLocale[]).map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l]}
              </option>
            ))}
          </select>
        </Field>
        <Check label={t.profile.emailNonEssential} checked={s.emailNonEssential} onChange={(v) => setS({ ...s, emailNonEssential: v })} />
      </Card>
      <Card>
        <h2>{t.profile.paymentHandles}</h2>
        {HANDLE_KEYS.map((k) => (
          <Field key={k} label={t.profile[k]} optional={t.common.optional}>
            <input className="input" value={s.handles[k]} maxLength={k === 'other' ? 200 : 120} onChange={(e) => setS({ ...s, handles: { ...s.handles, [k]: e.target.value } })} />
          </Field>
        ))}
      </Card>
      <Button type="submit" block loading={update.isPending}>
        {t.common.save}
      </Button>
      <Button variant="secondary" block onClick={() => void signOut().then(() => navigate('/sign-in', { replace: true }))}>
        {t.auth.signOut}
      </Button>
      <Button variant="danger" block loading={del.isPending} onClick={remove}>
        {t.auth.deleteAccount}
      </Button>
      {del.error ? <Banner tone="error">{errorMessage(del.error)}</Banner> : null}
    </form>
  );
}
