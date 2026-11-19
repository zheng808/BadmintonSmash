import { SettlementInput, computeSettlement, type Signup, type SignupPublic } from '@badmintonsmash/shared';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useEvent, useFinalize, useSettlement } from '@/api/hooks';
import { useToast } from '@/components/Toast';
import { Banner, Button, Card, Check, Field, Segmented, Spinner } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { errorMessage, issuesToFieldErrors } from '@/lib/errors';
import { centsToInput, formatCents, formatDateTime, parseMoney } from '@/lib/format';

function isFull(s: Signup | SignupPublic): s is Signup {
  return 'partySize' in s;
}

export function SettlePage() {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { id = '' } = useParams();
  const q = useEvent(id);
  const isHost = q.data?.kind === 'detail' && q.data.detail.me.isHost;
  const existing = useSettlement(id, isHost);
  const finalize = useFinalize(id);
  const [form, setForm] = useState({ courtCost: '', shuttleCount: '', shuttleUnitCost: '', otherCost: '', otherLabel: '', payers: 'attended' as 'attended' | 'confirmed' });
  const [includeLate, setIncludeLate] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [seeded, setSeeded] = useState(false);

  const settlement = existing.data ?? undefined;
  if (settlement && !seeded) {
    setSeeded(true);
    setForm({
      courtCost: centsToInput(settlement.courtCostCents),
      shuttleCount: String(settlement.shuttleCount),
      shuttleUnitCost: centsToInput(settlement.shuttleUnitCostCents),
      otherCost: settlement.otherCostCents ? centsToInput(settlement.otherCostCents) : '',
      otherLabel: settlement.otherLabel ?? '',
      payers: settlement.payers,
    });
    setIncludeLate(settlement.includeLateCancels);
  }

  const detail = q.data?.kind === 'detail' ? q.data.detail : undefined;
  const roster = useMemo(() => (detail ? detail.roster.filter(isFull) : []), [detail]);

  if (q.isPending || (isHost && existing.isPending)) return <Spinner />;
  if (q.error) return <Banner tone="error">{errorMessage(q.error)}</Banner>;
  if (!detail || !detail.me.isHost) return <Banner tone="error">{t.event.publicView}</Banner>;
  const { event } = detail;
  const currency = event.fee.currency;
  const started = Date.parse(event.startsAt) <= Date.now();
  const lateCancels = roster.filter((s) => s.status === 'cancelled' && s.lateCancel);

  const build = () => {
    const courtCostCents = parseMoney(form.courtCost || '0');
    const shuttleUnitCostCents = parseMoney(form.shuttleUnitCost || '0');
    const otherCostCents = parseMoney(form.otherCost || '0');
    const local: Record<string, string> = {};
    if (courtCostCents === undefined) local.courtCostCents = t.form.invalidMoney;
    if (shuttleUnitCostCents === undefined) local.shuttleUnitCostCents = t.form.invalidMoney;
    if (otherCostCents === undefined) local.otherCostCents = t.form.invalidMoney;
    if (!/^\d*$/.test(form.shuttleCount)) local.shuttleCount = t.form.invalidNumber;
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return undefined;
    }
    const parsed = SettlementInput.safeParse({
      courtCostCents,
      shuttleCount: Number(form.shuttleCount || 0),
      shuttleUnitCostCents,
      otherCostCents,
      otherLabel: form.otherLabel.trim() || undefined,
      payers: form.payers,
      includeLateCancels: includeLate,
    });
    if (!parsed.success) {
      setErrors(issuesToFieldErrors(parsed.error.issues));
      return undefined;
    }
    setErrors({});
    return parsed.data;
  };

  // Live preview with the shared calculator (the API recomputes authoritatively on finalise).
  const input = (() => {
    const c = parseMoney(form.courtCost || '0');
    const u = parseMoney(form.shuttleUnitCost || '0');
    const o = parseMoney(form.otherCost || '0');
    if (c === undefined || u === undefined || o === undefined || !/^\d*$/.test(form.shuttleCount)) return undefined;
    const payerIds = roster
      .filter((s) => s.status === 'confirmed' && (form.payers === 'confirmed' || s.attended !== false))
      .map((s) => s.userId)
      .concat(includeLate);
    return { courtCostCents: c, shuttleCount: Number(form.shuttleCount || 0), shuttleUnitCostCents: u, otherCostCents: o, payerIds };
  })();
  const preview = input ? computeSettlement(input) : undefined;

  const run = () => {
    const data = build();
    if (!data) return;
    if (!window.confirm(t.settle.finalizeConfirm)) return;
    finalize.mutate(data, { onSuccess: () => toast(t.common.done) });
  };

  const money = (label: string, key: 'courtCost' | 'shuttleUnitCost' | 'otherCost', errKey: string, optional?: boolean) => (
    <Field label={label} error={errors[errKey]} optional={optional ? t.common.optional : undefined}>
      <input className="input" inputMode="decimal" placeholder="0.00" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </Field>
  );

  return (
    <div className="stack">
      <h1>
        {t.settle.title} · <Link to={`/e/${event.eventId}`}>{event.title}</Link>
      </h1>
      <p className="muted small">{t.settle.intro}</p>
      {!started ? <Banner>{t.settle.notStarted}</Banner> : null}
      {settlement ? (
        <Banner tone="ok">
          {t.settle.finalizedAt(formatDateTime(settlement.finalizedAt, event.timezone, locale))} · {t.settle.refinalize}{' '}
          <Link to={`/e/${event.eventId}/roster`}>{t.settle.goToRoster}</Link>
        </Banner>
      ) : null}
      {finalize.error ? <Banner tone="error">{errorMessage(finalize.error)}</Banner> : null}
      {finalize.data && finalize.data.warnings.length > 0 ? (
        <Banner>
          <strong>{t.settle.warnings}</strong>
          <ul>
            {finalize.data.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Banner>
      ) : null}
      <Card>
        {money(t.settle.courtCost, 'courtCost', 'courtCostCents')}
        <div className="row">
          <Field label={t.settle.shuttleCount} error={errors.shuttleCount}>
            <input className="input" inputMode="numeric" value={form.shuttleCount} onChange={(e) => setForm({ ...form, shuttleCount: e.target.value })} />
          </Field>
          {money(t.settle.shuttleUnitCost, 'shuttleUnitCost', 'shuttleUnitCostCents')}
        </div>
        {money(t.settle.otherCost, 'otherCost', 'otherCostCents', true)}
        <Field label={t.settle.otherLabel} optional={t.common.optional}>
          <input className="input" value={form.otherLabel} maxLength={80} onChange={(e) => setForm({ ...form, otherLabel: e.target.value })} />
        </Field>
        <Segmented
          label={t.settle.payers}
          value={form.payers}
          onChange={(v) => setForm({ ...form, payers: v })}
          options={[
            { value: 'attended', label: t.settle.payersAttended },
            { value: 'confirmed', label: t.settle.payersConfirmed },
          ]}
        />
        {lateCancels.length > 0 ? (
          <Field label={t.settle.includeLateCancels}>
            {lateCancels.map((s) => (
              <Check
                key={s.userId}
                label={s.displayName}
                checked={includeLate.includes(s.userId)}
                onChange={(v) => setIncludeLate(v ? [...includeLate, s.userId] : includeLate.filter((u) => u !== s.userId))}
              />
            ))}
          </Field>
        ) : null}
      </Card>
      {preview ? (
        <Card>
          <h2>{t.settle.preview}</h2>
          <div className="list">
            <div className="item">
              <span className="grow">{t.settle.total}</span>
              <strong>{formatCents(preview.totalCents, currency, locale)}</strong>
            </div>
            <div className="item">
              <span className="grow">{t.settle.payerCount}</span>
              <strong>{preview.payerCount}</strong>
            </div>
            <div className="item">
              <span className="grow">{t.settle.perPlayer}</span>
              <strong>{formatCents(preview.perPlayerCents, currency, locale)}</strong>
            </div>
            {preview.surplusCents !== 0 ? (
              <div className="item">
                <span className="grow">{t.settle.surplus}</span>
                <span>{formatCents(preview.surplusCents, currency, locale)}</span>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
      <Button block loading={finalize.isPending} disabled={!started || !preview || preview.payerCount === 0} onClick={run}>
        {t.settle.finalize}
      </Button>
    </div>
  );
}
