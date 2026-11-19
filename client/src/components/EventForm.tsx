import {
  CreateEventInput,
  Currency,
  deviceTimezone,
  type CreateEventForm,
  type Event,
  type FeeMode,
  type Profile,
  UpdateEventInput,
  type UpdateEventInput as UpdateEventPatch,
  type Visibility,
} from '@badmintonsmash/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { useCreateEvent, useUpdateEvent } from '@/api/hooks';
import { Button } from '@/components/Button';
import { DateTimeField } from '@/components/DateTimeField';
import { ErrorBanner } from '@/components/ErrorBanner';
import { FormSection } from '@/components/FormSection';
import { MoneyField } from '@/components/MoneyField';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SwitchRow } from '@/components/SwitchRow';
import { TextField } from '@/components/TextField';
import { VenuePicker, type VenueValue } from '@/components/VenuePicker';
import { useT } from '@/i18n';
import { addHoursIso, nextRoundHour } from '@/lib/datetime';
import { errorMessage, issuesToFieldErrors } from '@/lib/errors';

interface FormState {
  title: string;
  description: string;
  venue: VenueValue;
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
  fixedAmountCents?: number;
  estimateCents?: number;
  hostIsPlaying: boolean;
  draft: boolean;
}

function defaults(me: Profile | undefined): FormState {
  const start = nextRoundHour(new Date(), 24).toISOString();
  return {
    title: '',
    description: '',
    venue: { name: '', address: '', mapUrl: '' },
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
    hostIsPlaying: true,
    draft: false,
  };
}

function fromEvent(e: Event, keepDates: boolean): FormState {
  return {
    title: e.title,
    description: e.description ?? '',
    venue: { name: e.venue.name, address: e.venue.address ?? '', mapUrl: e.venue.mapUrl ?? '', placeId: e.venue.placeId, lat: e.venue.lat, lng: e.venue.lng },
    startsAt: keepDates ? e.startsAt : undefined,
    endsAt: keepDates ? e.endsAt : undefined,
    timezone: e.timezone,
    capacity: String(e.capacity),
    courts: e.courts ? String(e.courts) : '',
    visibility: e.visibility,
    useWindow: !!(e.signupOpensAt || e.signupClosesAt),
    signupOpensAt: keepDates ? e.signupOpensAt : undefined,
    signupClosesAt: keepDates ? e.signupClosesAt : undefined,
    cancelDeadlineHours: e.cancelDeadlineHours !== undefined ? String(e.cancelDeadlineHours) : '',
    feeMode: e.fee.mode,
    currency: e.fee.currency,
    fixedAmountCents: e.fee.fixedAmountCents,
    estimateCents: e.fee.estimateCents,
    hostIsPlaying: true,
    draft: e.status === 'draft',
  };
}

const INT = /^\d+$/;
/** Optional fields the PATCH contract clears with `null`. */
const NULLABLE_ON_UPDATE = new Set(['description', 'courts', 'signupOpensAt', 'signupClosesAt', 'cancelDeadlineHours']);

interface EventFormProps {
  mode: 'create' | 'edit';
  /** Event being edited (edit) or duplicated (create). */
  initial?: Event;
  me?: Profile;
}

export function EventForm({ mode, initial, me }: EventFormProps) {
  const t = useT();
  const [s, setS] = useState<FormState>(() => (initial ? fromEvent(initial, mode === 'edit') : defaults(me)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateEvent();
  const update = useUpdateEvent(initial?.eventId ?? '');
  const busy = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  // Late-arriving defaults (profile) or duplicate source.
  useEffect(() => {
    if (initial) setS(fromEvent(initial, mode === 'edit'));
    else if (me) setS((prev) => ({ ...prev, timezone: prev.timezone || me.eventDefaults?.timezone || deviceTimezone(), currency: me.eventDefaults?.currency ?? prev.currency }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.eventId, initial?.version, me?.userId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setS((prev) => ({ ...prev, [key]: value }));

  const buildCandidate = (): CreateEventForm | undefined => {
    const local: Record<string, string> = {};
    if (!s.startsAt) local.startsAt = t.form.invalidDate;
    if (!s.endsAt) local.endsAt = t.form.invalidDate;
    if (!INT.test(s.capacity)) local.capacity = t.form.invalidNumber;
    if (s.courts && !INT.test(s.courts)) local.courts = t.form.invalidNumber;
    if (s.cancelDeadlineHours && !INT.test(s.cancelDeadlineHours)) local.cancelDeadlineHours = t.form.invalidNumber;
    if (mode === 'edit' && initial && INT.test(s.capacity) && Number(s.capacity) < initial.confirmedCount) {
      local.capacity = t.form.capacityBelowConfirmed(initial.confirmedCount);
    }
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return undefined;
    }
    return {
      title: s.title,
      description: s.description.trim() || undefined,
      venue: {
        name: s.venue.name.trim(),
        address: s.venue.address.trim() || undefined,
        mapUrl: s.venue.mapUrl.trim() || undefined,
        placeId: s.venue.placeId,
        lat: s.venue.lat,
        lng: s.venue.lng,
      },
      startsAt: s.startsAt ?? '',
      endsAt: s.endsAt ?? '',
      timezone: s.timezone.trim(),
      capacity: Number(s.capacity),
      courts: s.courts ? Number(s.courts) : undefined,
      visibility: s.visibility,
      signupOpensAt: s.useWindow ? s.signupOpensAt : undefined,
      signupClosesAt: s.useWindow ? s.signupClosesAt : undefined,
      cancelDeadlineHours: s.cancelDeadlineHours ? Number(s.cancelDeadlineHours) : undefined,
      fee: {
        mode: s.feeMode,
        currency: s.currency,
        fixedAmountCents: s.feeMode === 'fixed' ? s.fixedAmountCents : undefined,
        estimateCents: s.feeMode === 'settle_after' ? s.estimateCents : undefined,
      },
      hostIsPlaying: s.hostIsPlaying,
      draft: s.draft,
    };
  };

  const submit = () => {
    const candidate = buildCandidate();
    if (!candidate) return;
    if (mode === 'create') {
      const parsed = CreateEventInput.safeParse(candidate);
      if (!parsed.success) {
        setErrors(issuesToFieldErrors(parsed.error.issues));
        return;
      }
      setErrors({});
      create.mutate(parsed.data, { onSuccess: (d) => router.replace({ pathname: '/e/[id]', params: { id: d.event.eventId } }) });
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
        // Field was cleared: send null for the fields the contract allows clearing.
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
      router.back();
      return;
    }
    update.mutate(parsed.data as UpdateEventPatch, { onSuccess: () => router.back() });
  };

  const fieldError = (key: string) => errors[key] ?? (errors.fee && key === 'fee' ? errors.fee : undefined);

  return (
    <>
      {error ? <ErrorBanner message={errorMessage(error)} /> : null}
      <FormSection title={t.form.sections.basics}>
        <TextField label={t.form.title} value={s.title} onChangeText={(v) => set('title', v)} error={fieldError('title')} maxLength={80} />
        <TextField label={t.form.description} value={s.description} onChangeText={(v) => set('description', v)} error={fieldError('description')} multiline optional={t.common.optional} />
        <VenuePicker value={s.venue} onChange={(v) => set('venue', v)} error={fieldError('venue')} />
        <TextField label={t.form.capacity} value={s.capacity} onChangeText={(v) => set('capacity', v)} keyboardType="number-pad" error={fieldError('capacity')} />
        <TextField label={t.form.courts} value={s.courts} onChangeText={(v) => set('courts', v)} keyboardType="number-pad" error={fieldError('courts')} optional={t.common.optional} />
      </FormSection>

      <FormSection title={t.form.sections.when}>
        <TextField label={t.form.timezone} value={s.timezone} onChangeText={(v) => set('timezone', v)} autoCapitalize="none" error={fieldError('timezone')} />
        <DateTimeField label={t.form.startsAt} value={s.startsAt} timezone={s.timezone} onChange={(v) => set('startsAt', v)} error={fieldError('startsAt')} />
        <DateTimeField label={t.form.endsAt} value={s.endsAt} timezone={s.timezone} onChange={(v) => set('endsAt', v)} error={fieldError('endsAt')} />
      </FormSection>

      <FormSection title={t.form.sections.signups}>
        <SegmentedControl
          label={t.form.visibility}
          options={[
            { value: 'link', label: t.form.visibilityLink },
            { value: 'public', label: t.form.visibilityPublic },
          ]}
          value={s.visibility}
          onChange={(v) => set('visibility', v)}
        />
        <SwitchRow label={t.form.useWindow} value={s.useWindow} onChange={(v) => set('useWindow', v)} />
        {s.useWindow ? (
          <>
            <DateTimeField label={t.form.signupOpensAt} value={s.signupOpensAt} timezone={s.timezone} onChange={(v) => set('signupOpensAt', v)} error={fieldError('signupOpensAt')} />
            <DateTimeField label={t.form.signupClosesAt} value={s.signupClosesAt} timezone={s.timezone} onChange={(v) => set('signupClosesAt', v)} error={fieldError('signupClosesAt')} />
          </>
        ) : null}
        <TextField
          label={t.form.cancelDeadline}
          value={s.cancelDeadlineHours}
          onChangeText={(v) => set('cancelDeadlineHours', v)}
          keyboardType="number-pad"
          error={fieldError('cancelDeadlineHours')}
          optional={t.common.optional}
        />
        {mode === 'create' ? <SwitchRow label={t.form.hostIsPlaying} value={s.hostIsPlaying} onChange={(v) => set('hostIsPlaying', v)} /> : null}
      </FormSection>

      <FormSection title={t.form.sections.fee}>
        <SegmentedControl
          label={t.form.fee}
          options={[
            { value: 'settle_after', label: t.form.feeSettleAfter },
            { value: 'fixed', label: t.form.feeFixed },
          ]}
          value={s.feeMode}
          onChange={(v) => set('feeMode', v)}
        />
        <SegmentedControl label={t.form.currency} options={Currency.options.map((c) => ({ value: c, label: c }))} value={s.currency} onChange={(v) => set('currency', v)} />
        {s.feeMode === 'fixed' ? (
          <MoneyField label={t.form.fixedAmount} cents={s.fixedAmountCents} onChangeCents={(v) => set('fixedAmountCents', v)} currency={s.currency} error={fieldError('fee')} />
        ) : (
          <MoneyField label={t.form.estimate} cents={s.estimateCents} onChangeCents={(v) => set('estimateCents', v)} currency={s.currency} optional={t.common.optional} />
        )}
        {mode === 'create' ? <SwitchRow label={t.form.draft} value={s.draft} onChange={(v) => set('draft', v)} /> : null}
      </FormSection>

      <Button title={mode === 'create' ? t.form.create : t.form.saveChanges} onPress={submit} loading={busy} />
    </>
  );
}
