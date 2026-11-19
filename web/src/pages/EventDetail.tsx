import type { EventDetail, EventPublic, Signup, SignupPublic } from '@badmintonsmash/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useEvent, useEventAction, useJoin, useLeave, useUpdateMySignup, type EventAction } from '@/api/hooks';
import { useSession } from '@/auth/session';
import { StatusChip } from '@/components/EventCard';
import { PaymentHandles } from '@/components/PaymentHandles';
import { useToast } from '@/components/Toast';
import { mapsLink } from '@/components/VenuePicker';
import { Banner, Button, Card, Chip, Field, Spinner } from '@/components/ui';
import { env, eventShareUrl } from '@/env';
import { useLocale, useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { formatCents, formatDateTime, formatRange } from '@/lib/format';
import { copyText, rosterText, splitRoster } from '@/lib/roster';

function isHostView(s: Signup | SignupPublic): s is Signup {
  return 'partySize' in s;
}

function Header({ event }: { event: EventPublic }) {
  const t = useT();
  const locale = useLocale();
  const link = mapsLink(event.venue);
  const left = event.capacity - event.confirmedCount;
  const pct = Math.min(100, Math.round((event.confirmedCount / event.capacity) * 100));
  return (
    <Card>
      <div className="row between">
        <h1 style={{ margin: 0 }}>{event.title}</h1>
        <StatusChip status={event.status} />
      </div>
      <div>{formatRange(event.startsAt, event.endsAt, event.timezone, locale)}</div>
      <div>
        {link ? (
          <a href={link} target="_blank" rel="noreferrer">
            {event.venue.name} ↗
          </a>
        ) : (
          event.venue.name
        )}
        {event.venue.address ? <div className="muted small">{event.venue.address}</div> : null}
      </div>
      <div className="bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="row small">
        <span>{t.event.confirmedOf(event.confirmedCount, event.capacity)}</span>
        <span className="muted">· {event.status === 'open' ? (left > 0 ? t.event.spotsLeft(left) : t.event.full) : null}</span>
        {event.waitlistCount > 0 ? <span className="muted">· {t.event.waitlistCount(event.waitlistCount)}</span> : null}
        {event.courts ? <span className="muted">· {t.event.courts(event.courts)}</span> : null}
      </div>
      <div className="small">
        {event.fee.mode === 'fixed' && event.fee.fixedAmountCents !== undefined
          ? t.event.feeFixed(formatCents(event.fee.fixedAmountCents, event.fee.currency, locale))
          : `${t.event.feeSettleAfter}${event.fee.estimateCents !== undefined ? ` · ${t.event.feeEstimate(formatCents(event.fee.estimateCents, event.fee.currency, locale))}` : ''}`}
      </div>
      {event.signupClosesAt && event.status === 'open' ? <div className="muted small">{t.event.signupsClose(formatDateTime(event.signupClosesAt, event.timezone, locale))}</div> : null}
      {event.cancelDeadlineHours ? <div className="muted small">{t.event.cancelDeadline(event.cancelDeadlineHours)}</div> : null}
      <div className="muted small">{t.event.hostedBy(event.hostDisplayName)}</div>
      {event.description ? <p className="pre">{event.description}</p> : null}
    </Card>
  );
}

function Roster({ roster, capacity }: { roster: (Signup | SignupPublic)[]; capacity: number }) {
  const t = useT();
  const { confirmed, waitlisted } = splitRoster(roster);
  return (
    <Card>
      <h2>
        {t.event.roster} <span className="muted small">{t.event.confirmedOf(confirmed.length, capacity)}</span>
      </h2>
      {confirmed.length === 0 ? <div className="muted small">{t.roster.empty}</div> : null}
      <div className="list">
        {confirmed.map((s, i) => (
          <div className="item" key={s.userId}>
            <span className="num">{i + 1}.</span>
            <span className="grow">{s.displayName}</span>
            {isHostView(s) && s.note ? <span className="muted small">{s.note}</span> : null}
          </div>
        ))}
      </div>
      {waitlisted.length > 0 ? (
        <>
          <h3>{t.event.waitlist}</h3>
          <div className="list">
            {waitlisted.map((s, i) => (
              <div className="item" key={s.userId}>
                <span className="num">{i + 1}.</span>
                <span className="grow">{s.displayName}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Card>
  );
}

function PlayerActions({ detail }: { detail: EventDetail }) {
  const t = useT();
  const locale = useLocale();
  const { event, me } = detail;
  const join = useJoin(event.eventId);
  const leave = useLeave(event.eventId);
  const updateMine = useUpdateMySignup(event.eventId);
  const [note, setNote] = useState(me.signup?.note ?? '');
  const active = me.signup && (me.signup.status === 'confirmed' || me.signup.status === 'waitlisted');
  const err = join.error ?? leave.error ?? updateMine.error;
  const owed = me.signup?.amountOwedCents;
  return (
    <Card>
      {err ? <Banner tone="error">{errorMessage(err)}</Banner> : null}
      {active && me.signup ? (
        <>
          <Banner tone={me.signup.status === 'confirmed' ? 'ok' : 'info'}>
            {me.signup.status === 'confirmed' ? t.event.youAreIn : t.event.youAreWaitlisted(me.position ?? 1)}
          </Banner>
          {owed !== undefined && owed > 0 ? (
            <div className="row between">
              <span className="title">{t.event.owe(formatCents(owed, event.fee.currency, locale))}</span>
              <Chip tone={me.signup.paymentStatus === 'paid' ? 'ok' : me.signup.paymentStatus === 'waived' ? undefined : 'warn'}>{t.payment[me.signup.paymentStatus ?? 'unpaid']}</Chip>
            </div>
          ) : null}
          {owed !== undefined && owed > 0 && me.signup.paymentStatus === 'unpaid' ? (
            me.signup.claimedPaidAt ? (
              <span className="muted small">{t.event.claimedPaid}</span>
            ) : (
              <Button variant="secondary" small loading={updateMine.isPending} onClick={() => updateMine.mutate({ claimedPaid: true })}>
                {t.event.iHavePaid}
              </Button>
            )
          ) : null}
          <Field label={t.event.note} optional={t.common.optional}>
            <div className="row">
              <input className="input grow" value={note} maxLength={200} placeholder={t.event.noteHint} onChange={(e) => setNote(e.target.value)} />
              <Button variant="secondary" small loading={updateMine.isPending} disabled={note === (me.signup.note ?? '')} onClick={() => updateMine.mutate({ note: note.trim() })}>
                {t.event.saveNote}
              </Button>
            </div>
          </Field>
          {event.status === 'open' || event.status === 'closed' ? (
            <Button
              variant="danger"
              block
              loading={leave.isPending}
              onClick={() => {
                if (window.confirm(t.event.leaveConfirm)) leave.mutate();
              }}>
              {t.event.leave}
            </Button>
          ) : null}
        </>
      ) : me.canJoin ? (
        <>
          <Field label={t.event.note} optional={t.common.optional}>
            <input className="input" value={note} maxLength={200} placeholder={t.event.noteHint} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button block loading={join.isPending} onClick={() => join.mutate(note.trim() ? { note: note.trim() } : {})}>
            {event.confirmedCount < event.capacity ? t.event.join : t.event.joinWaitlist}
          </Button>
        </>
      ) : (
        <Banner>{me.cannotJoinReason ?? t.event.cannotJoin}</Banner>
      )}
    </Card>
  );
}

function HostTools({ detail }: { detail: EventDetail }) {
  const t = useT();
  const { event } = detail;
  const act = useEventAction(event.eventId);
  const run = (action: EventAction, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    const body = action === 'cancel' ? { reason: window.prompt(t.event.cancelReason) ?? undefined } : undefined;
    act.mutate({ action, body });
  };
  const s = event.status;
  return (
    <Card>
      <h2>{t.event.hostTools}</h2>
      {act.error ? <Banner tone="error">{errorMessage(act.error)}</Banner> : null}
      <div className="row">
        {s !== 'cancelled' && s !== 'completed' ? (
          <Link to={`/e/${event.eventId}/edit`} className="btn secondary sm">
            {t.event.actions.edit}
          </Link>
        ) : null}
        <Link to={`/e/${event.eventId}/roster`} className="btn secondary sm">
          {t.event.actions.roster}
        </Link>
        {s !== 'draft' && s !== 'cancelled' ? (
          <Link to={`/e/${event.eventId}/settle`} className="btn secondary sm">
            {t.event.actions.settle}
          </Link>
        ) : null}
      </div>
      <div className="row">
        {s === 'draft' ? (
          <Button small loading={act.isPending} onClick={() => run('publish')}>
            {t.event.actions.publish}
          </Button>
        ) : null}
        {s === 'open' ? (
          <Button variant="secondary" small loading={act.isPending} onClick={() => run('close')}>
            {t.event.actions.close}
          </Button>
        ) : null}
        {s === 'closed' ? (
          <Button variant="secondary" small loading={act.isPending} onClick={() => run('reopen')}>
            {t.event.actions.reopen}
          </Button>
        ) : null}
        {s === 'open' || s === 'closed' ? (
          <Button variant="secondary" small loading={act.isPending} onClick={() => run('complete', t.event.completeConfirm)}>
            {t.event.actions.complete}
          </Button>
        ) : null}
        {s !== 'cancelled' && s !== 'completed' ? (
          <Button variant="danger" small loading={act.isPending} onClick={() => run('cancel', t.event.cancelConfirm)}>
            {t.event.actions.cancel}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

export function EventDetailPage() {
  const t = useT();
  const toast = useToast();
  const { id = '' } = useParams();
  const { session } = useSession();
  const q = useEvent(id);

  if (q.isPending) return <Spinner />;
  if (q.error) return <Banner tone="error">{errorMessage(q.error)}</Banner>;
  const view = q.data;
  const event = view.kind === 'detail' ? view.detail.event : view.event;
  const shareUrl = eventShareUrl(event.eventId);
  const copyLink = () => void copyText(shareUrl).then((ok) => ok && toast(t.common.copied));
  const copyRoster = () => {
    if (view.kind !== 'detail') return;
    void copyText(rosterText(event, view.detail.roster, shareUrl)).then((ok) => ok && toast(t.common.copied));
  };

  return (
    <>
      {event.status === 'cancelled' ? <Banner tone="error">{t.event.cancelledBanner}</Banner> : null}
      {event.status === 'draft' ? <Banner>{t.event.draftBanner}</Banner> : null}
      <Header event={event} />
      {view.kind === 'detail' ? (
        <>
          {view.detail.me.isHost ? <HostTools detail={view.detail} /> : <PlayerActions detail={view.detail} />}
          <Card>
            <h2>{t.event.howToPay}</h2>
            <div className="muted small">{view.detail.host.displayName}</div>
            <PaymentHandles handles={view.detail.host.paymentHandles} />
          </Card>
          <Roster roster={view.detail.roster} capacity={event.capacity} />
        </>
      ) : (
        <Card>
          <p className="muted">{t.event.publicView}</p>
          {session.status !== 'signedIn' ? (
            <Link to={`/sign-in?redirect=${encodeURIComponent(`/e/${event.eventId}`)}`} className="btn block">
              {t.auth.signInToJoin}
            </Link>
          ) : null}
        </Card>
      )}
      <div className="row">
        <Button variant="secondary" small onClick={copyLink}>
          {t.event.shareLink}
        </Button>
        {view.kind === 'detail' ? (
          <Button variant="secondary" small onClick={copyRoster}>
            {t.event.shareRoster}
          </Button>
        ) : null}
        {env.devAuth ? <span className="muted small">dev</span> : null}
      </div>
    </>
  );
}
