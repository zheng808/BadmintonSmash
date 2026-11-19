import {
  CreateEventInput,
  Currency,
  UpdateEventInput,
  type CreateEventForm,
  type Event,
  type FeeMode,
  type Profile,
  type UpdateEventInput as UpdateEventPatch,
  type Venue,
  type Visibility,
} from '@badmintonsmash/shared';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useCreateEvent, useUpdateEvent } from '@/api/hooks';
import { VenuePicker } from '@/components/VenuePicker';
import { Banner, Button, Card, Check, Field, Segmented } from '@/components/ui';
import { useT } from '@/i18n';
import { addHoursIso, deviceTimezone, isoToZonedLocal, nextRoundHourIso, zonedLocalToIso } from '@/lib/datetime';
import { errorMessage, issuesToFieldErrors } from '@/lib/errors';
import { centsToInput, parseMoney } from '@/lib/format';

interface FormState {
  title: string;
  description: string;
  venue: Venue;
  startsAt?: string;
  endsAt?: string;
  timezone: string;
  capacity: string;
  courts: string;
  visibility: Visibility;
  useWindow: boolean;
  signupOpensAt?: string;
  signupClosesAt?: string;
  cancelDeadlineHours: string;
  feeMode: FeeMode;
  currency: Currency;
  fixedAmount: string;
  estimate: string;
  hostIsPlaying: boolean;
  draft: boolean;
}

function defaults(me: Profile | undefined): FormState {
  const start = nextRoundHourIso(24);
  return {
    title: '',
    description: '',
    venue: { name: '' },
    startsAt: start,
    endsAt: addHoursIso(start, 2),
    timezone: me?.eventDefaults?.timezone ?? deviceTimezone(),
    capacity: '12',
    courts: '',
    visibility: 'link',
    useWindow: false,
    cancelDeadlineHours: '',
    feeMode: 'settle_after',
    currency: me?.eventDefaults?.currency ?? 'CAD',
    fixedAmount: '',
    estimate: '',
    hostIsPlaying: true,
    draft: false,
  };
}

function fromEvent(e: Event): FormState {
  return {
    title: e.title,
    description: e.description ?? '',
    venue: e.venue,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    timezone: e.timezone,
    capacity: String(e.capacity),
    courts: e.courts ? String(e.courts) : '',
    visibility: e.visibility,
    useWindow: !!(e.signupOpensAt || e.signupClosesAt),
    signupOpensAt: e.signupOpensAt,
    signupClosesAt: e.signupClosesAt,
    cancelDeadlineHours: e.cancelDeadlineHours !== undefined ? String(e.cancelDeadlineHours) : '',
    feeMode: e.fee.mode,
    currency: e.fee.currency,
    fixedAmount: centsToInput(e.fee.fixedAmountCents),
    estimate: centsToInput(e.fee.estimateCents),
    hostIsPlaying: true,
    draft: e.status === 'draft',
  };
}

const INT = /^\d+$/;
/** Optional fields the PATCH contract clears with `null`. */
const NULLABLE_ON_UPDATE = new Set(['description', 'courts', 'signupOpensAt', 'signupClosesAt', 'cancelDeadlineHours']);

export function EventForm({ mode, initial, me }: { mode: 'create' | 'edit'; initial?: Event; me?: Profile }) {
  const t = useT();
  const navigate = useNavigate();
  const [s, setS] = useState<FormState>(() => (initial ? fromEvent(initial) : defaults(me)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateEvent();
  const update = useUpdateEvent(initial?.eventId ?? '');
  const busy = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setS((prev) => ({ ...prev, [key]: value }));

  const dateField = (label: string, key: 'startsAt' | 'endsAt' | 'signupOpensAt' | 'signupClosesAt') => (
    <Field label={label} error={errors[key]}>
      <input className="input" type="datetime-local" value={isoToZonedLocal(s[key], s.timezone)} onChange={(e) => set(key, zonedLocalToIso(e.target.value, s.timezone))} />
    </Field>
  );

  const moneyField = (label: string, key: 'fixedAmount' | 'estimate', optional?: boolean) => (
    <Field label={label} error={errors.fee} optional={optional ? t.common.optional : undefined}>
      <input className="input" inputMode="decimal" placeholder="12.50" value={s[key]} onChange={(e) => set(key, e.target.value)} />
    </Field>
  );

  const buildCandidate = (): CreateEventForm | undefined => {
    const local: Record<string, string> = {};
    if (!s.startsAt) local.startsAt = t.form.invalidDate;
    if (!s.endsAt) local.endsAt = t.form.invalidDate;
    if (!INT.test(s.capacity)) local.capacity = t.form.invalidNumber;
    if (s.courts && !INT.test(s.courts)) local.courts = t.form.invalidNumber;
    if (s.cancelDeadlineHours && !INT.test(s.cancelDeadlineHours)) local.cancelDeadlineHours = t.form.invalidNumber;
    const fixedAmountCents = s.feeMode === 'fixed' ? parseMoney(s.fixedAmount) : undefined;
    const estimateCents = s.feeMode === 'settle_after' && s.estimate.trim() ? parseMoney(s.estimate) : undefined;
    if (s.feeMode === 'fixed' && fixedAmountCents === undefined) local.fee = t.form.invalidMoney;
    if (s.feeMode === 'settle_after' && s.estimate.trim() && estimateCents === undefined) local.fee = t.form.invalidMoney;
    if (mode === 'edit' && initial && INT.test(s.capacity) && Number(s.capacity) < initial.confirmedCount) {
      local.capacity = t.form.capacityBelowConfirmed(initial.confirmedCount);
    }
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return undefined;
    }
    const venue: Venue = { ...s.venue, name: s.venue.name.trim(), address: s.venue.address?.trim() || undefined, mapUrl: s.venue.mapUrl?.trim() || undefined };
    return {
      title: s.title,
      description: s.description.trim() || undefined,
      venue,
      startsAt: s.startsAt ?? '',
      endsAt: s.endsAt ?? '',
      timezone: s.timezone.trim(),
      capacity: Number(s.capacity),
      courts: s.courts ? Number(s.courts) : undefined,
      visibility: s.visibility,
      signupOpensAt: s.useWindow ? s.signupOpensAt : undefined,
      signupClosesAt: s.useWindow ? s.signupClosesAt : undefined,
      cancelDeadlineHours: s.cancelDeadlineHours ? Number(s.cancelDeadlineHours) : undefined,
      fee: { mode: s.feeMode, currency: s.currency, fixedAmountCents, estimateCents },
      hostIsPlaying: s.hostIsPlaying,
      draft: s.draft,
    };
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const candidate = buildCandidate();
    if (!candidate) return;
    if (mode === 'create') {
      const parsed = CreateEventInput.safeParse(candidate);
      if (!parsed.success) {
        setErrors(issuesToFieldErrors(parsed.error.issues));
        return;
      }
      setErrors({});
      create.mutate(parsed.data, { onSuccess: (d) => navigate(`/e/${d.event.eventId}`, { replace: true }) });
      return;
    }
    if (!initial) return;
    const { hostIsPlaying: _h, draft: _d, ...full } = candidate;
    const patch: Record<string, unknown> = {};
    const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const prev: Record<string, unknown> = {
      title: initial.title,
      description: initial.description,
      venue: initial.venue,
      startsAt: initial.startsAt,
      endsAt: initial.endsAt,
      timezone: initial.timezone,
      capacity: initial.capacity,
      courts: initial.courts,
      visibility: initial.visibility,
      signupOpensAt: initial.signupOpensAt,
      signupClosesAt: initial.signupClosesAt,
      cancelDeadlineHours: initial.cancelDeadlineHours,
      fee: initial.fee,
    };
    for (const [k, v] of Object.entries(full)) {
      if (same(v, prev[k])) continue;
      if (v === undefined) {
        if (NULLABLE_ON_UPDATE.has(k) && prev[k] !== undefined) patch[k] = null;
        continue;
      }
      patch[k] = v;
    }
    const parsed = UpdateEventInput.safeParse(patch);
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    if (Object.keys(parsed.data).length === 0) {
      navigate(-1);
      return;
    }
    update.mutate(parsed.data as UpdateEventPatch, { onSuccess: () => navigate(`/e/${initial.eventId}`, { replace: true }) });
  };

  return (
    <form className="stack" onSubmit={submit}>
      <h1>{mode === 'create' ? t.form.newEvent : t.form.editEvent}</h1>
      {error ? <Banner tone="error">{errorMessage(error)}</Banner> : null}
      <Card>
        <h2>{t.form.sections.basics}</h2>
        <Field label={t.form.title} error={errors.title}>
          <input className="input" value={s.title} maxLength={80} placeholder={t.form.titlePlaceholder} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label={t.form.description} optional={t.common.optional} error={errors.description}>
          <textarea className="input" value={s.description} maxLength={2000} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="row">
          <Field label={t.form.capacity} error={errors.capacity}>
            <input className="input" inputMode="numeric" value={s.capacity} onChange={(e) => set('capacity', e.target.value)} />
          </Field>
          <Field label={t.form.courts} optional={t.common.optional} error={errors.courts}>
            <input className="input" inputMode="numeric" value={s.courts} onChange={(e) => set('courts', e.target.value)} />
          </Field>
        </div>
      </Card>
      <Card>
        <h2>{t.form.sections.venue}</h2>
        <VenuePicker value={s.venue} onChange={(v) => set('venue', v)} error={errors.venue} />
      </Card>
      <Card>
        <h2>{t.form.sections.when}</h2>
        <Field label={t.form.timezone} error={errors.timezone}>
          <input className="input" value={s.timezone} autoCapitalize="none" onChange={(e) => set('timezone', e.target.value)} />
        </Field>
        {dateField(t.form.startsAt, 'startsAt')}
        {dateField(t.form.endsAt, 'endsAt')}
      </Card>
      <Card>
        <h2>{t.form.sections.signups}</h2>
        <Segmented
          label={t.form.visibility}
          value={s.visibility}
          onChange={(v) => set('visibility', v)}
          options={[
            { value: 'link', label: t.form.visibilityLink },
            { value: 'public', label: t.form.visibilityPublic },
          ]}
        />
        <Check label={t.form.useWindow} checked={s.useWindow} onChange={(v) => set('useWindow', v)} />
        {s.useWindow ? (
          <>
            {dateField(t.form.signupOpensAt, 'signupOpensAt')}
            {dateField(t.form.signupClosesAt, 'signupClosesAt')}
          </>
        ) : null}
        <Field label={t.form.cancelDeadline} optional={t.common.optional} error={errors.cancelDeadlineHours}>
          <input className="input" inputMode="numeric" value={s.cancelDeadlineHours} onChange={(e) => set('cancelDeadlineHours', e.target.value)} />
        </Field>
        {mode === 'create' ? <Check label={t.form.hostIsPlaying} checked={s.hostIsPlaying} onChange={(v) => set('hostIsPlaying', v)} /> : null}
      </Card>
      <Card>
        <h2>{t.form.sections.fee}</h2>
        <Segmented
          label={t.form.fee}
          value={s.feeMode}
          onChange={(v) => set('feeMode', v)}
          options={[
            { value: 'settle_after', label: t.form.feeSettleAfter },
            { value: 'fixed', label: t.form.feeFixed },
          ]}
        />
        <Segmented label={t.form.currency} value={s.currency} onChange={(v) => set('currency', v)} options={Currency.options.map((c) => ({ value: c, label: c }))} />
        {s.feeMode === 'fixed' ? moneyField(t.form.fixedAmount, 'fixedAmount') : moneyField(t.form.estimate, 'estimate', true)}
        {mode === 'create' ? <Check label={t.form.draft} checked={s.draft} onChange={(v) => set('draft', v)} /> : null}
      </Card>
      <Button type="submit" block loading={busy}>
        {mode === 'create' ? t.form.create : t.form.saveChanges}
      </Button>
    </form>
  );
}
