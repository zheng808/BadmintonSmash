import type { PaymentStatus, Signup, SignupPublic } from '@badmintonsmash/shared';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAddSignup, useEvent, useHostUpdateSignup, useRemoveSignup } from '@/api/hooks';
import { Banner, Button, Card, Check, Chip, Spinner } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { formatCents, formatDateTime } from '@/lib/format';
import { splitRoster } from '@/lib/roster';

function isFull(s: Signup | SignupPublic): s is Signup {
  return 'partySize' in s;
}

export function RosterPage() {
  const t = useT();
  const locale = useLocale();
  const { id = '' } = useParams();
  const q = useEvent(id);
  const hostUpdate = useHostUpdateSignup(id);
  const remove = useRemoveSignup(id);
  const add = useAddSignup(id);
  const [email, setEmail] = useState('');

  if (q.isPending) return <Spinner />;
  if (q.error) return <Banner tone="error">{errorMessage(q.error)}</Banner>;
  if (q.data.kind !== 'detail' || !q.data.detail.me.isHost) return <Banner tone="error">{t.event.publicView}</Banner>;
  const { event, roster } = q.data.detail;
  const full = roster.filter(isFull);
  const { confirmed, waitlisted } = splitRoster(full);
  const settled = event.settlement !== undefined || event.fee.mode === 'fixed';
  const started = Date.parse(event.startsAt) <= Date.now();
  const collected = full.filter((s) => s.paymentStatus === 'paid').reduce((a, s) => a + (s.amountOwedCents ?? 0), 0);
  const outstanding = full.filter((s) => s.paymentStatus === 'unpaid').reduce((a, s) => a + (s.amountOwedCents ?? 0), 0);
  const err = hostUpdate.error ?? remove.error ?? add.error;

  const submitAdd = (e: FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) return;
    add.mutate({ email: addr }, { onSuccess: () => setEmail('') });
  };

  const row = (s: Signup, i: number, waitlist: boolean) => (
    <div className="card" key={s.userId}>
      <div className="row between">
        <span className="title">
          <span className="num">{i + 1}.</span> {s.displayName}
        </span>
        <span className="row">
          {s.lateCancel ? <Chip tone="warn">{t.roster.lateCancel}</Chip> : null}
          {s.claimedPaidAt && s.paymentStatus === 'unpaid' ? <Chip tone="primary">{t.roster.claimed}</Chip> : null}
          <Button
            variant="danger"
            small
            loading={remove.isPending && remove.variables?.userId === s.userId}
            onClick={() => {
              if (window.confirm(t.roster.removeConfirm(s.displayName))) remove.mutate({ userId: s.userId });
            }}>
            {t.roster.remove}
          </Button>
        </span>
      </div>
      <div className="muted small">
        {t.roster.joined} {formatDateTime(s.joinedAt, event.timezone, locale)}
        {s.email ? ` · ${s.email}` : ''}
        {s.phone ? ` · ${s.phone}` : ''}
        {s.note ? ` · ${s.note}` : ''}
      </div>
      {!waitlist ? (
        <div className="row between">
          {started ? (
            <Check label={s.attended === false ? t.roster.noShow : t.roster.attended} checked={s.attended !== false} onChange={(v) => hostUpdate.mutate({ userId: s.userId, input: { attended: v } })} />
          ) : (
            <span />
          )}
          {settled && s.amountOwedCents !== undefined ? (
            <span className="row">
              <span className="small">
                {t.roster.amount} {formatCents(s.amountOwedCents, event.fee.currency, locale)}
              </span>
              <select
                className="input"
                style={{ minHeight: 36, width: 'auto', padding: '4px 8px' }}
                value={s.paymentStatus ?? 'unpaid'}
                onChange={(e) => hostUpdate.mutate({ userId: s.userId, input: { paymentStatus: e.target.value as PaymentStatus } })}>
                {(['unpaid', 'paid', 'waived'] as const).map((p) => (
                  <option key={p} value={p}>
                    {t.payment[p]}
                  </option>
                ))}
              </select>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      <h1>
        <Link to={`/e/${event.eventId}`}>{event.title}</Link>
      </h1>
      <p className="muted small">{t.event.confirmedOf(event.confirmedCount, event.capacity)}{settled ? ` · ${t.roster.summary(formatCents(collected, event.fee.currency, locale), formatCents(outstanding, event.fee.currency, locale))}` : ''}</p>
      {err ? <Banner tone="error">{errorMessage(err)}</Banner> : null}
      <Card>
        <form className="row" onSubmit={submitAdd}>
          <input className="input grow" type="email" placeholder={t.roster.addByEmail} value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" small loading={add.isPending} disabled={!email.trim()}>
            {t.roster.add}
          </Button>
        </form>
      </Card>
      <h2>{t.event.roster}</h2>
      {confirmed.length === 0 ? <p className="muted">{t.roster.empty}</p> : confirmed.map((s, i) => row(s, i, false))}
      {waitlisted.length > 0 ? (
        <>
          <h2>{t.event.waitlist}</h2>
          {waitlisted.map((s, i) => row(s, i, true))}
        </>
      ) : null}
    </>
  );
}
