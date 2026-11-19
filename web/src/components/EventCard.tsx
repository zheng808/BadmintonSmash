import type { EventSummary } from '@badmintonsmash/shared';
import { Link } from 'react-router-dom';

import { Chip } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { formatCents, formatRange } from '@/lib/format';

export function EventCard({ e }: { e: EventSummary }) {
  const t = useT();
  const locale = useLocale();
  const left = e.capacity - e.confirmedCount;
  return (
    <Link to={`/e/${e.eventId}`} className="card link">
      <div className="row between">
        <span className="title">{e.title}</span>
        <StatusChip status={e.status} />
      </div>
      <div className="muted small">{formatRange(e.startsAt, e.endsAt, e.timezone, locale)}</div>
      <div className="muted small">{e.venue.name}</div>
      <div className="row small">
        <span>{e.status === 'open' ? (left > 0 ? t.event.spotsLeft(left) : t.event.full) : t.event.confirmedOf(e.confirmedCount, e.capacity)}</span>
        {e.waitlistCount > 0 ? <span className="muted">· {t.event.waitlistCount(e.waitlistCount)}</span> : null}
        <span className="muted">· {e.fee.mode === 'fixed' && e.fee.fixedAmountCents !== undefined ? t.event.feeFixed(formatCents(e.fee.fixedAmountCents, e.fee.currency, locale)) : t.event.feeSettleAfter}</span>
        {e.mySignupStatus ? (
          <span className="right">
            <Chip tone={e.mySignupStatus === 'confirmed' ? 'ok' : e.mySignupStatus === 'waitlisted' ? 'warn' : undefined}>{t.signup[e.mySignupStatus]}</Chip>
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export function StatusChip({ status }: { status: EventSummary['status'] }) {
  const t = useT();
  const tone = status === 'open' ? 'ok' : status === 'cancelled' ? 'danger' : status === 'draft' ? 'warn' : undefined;
  return <Chip tone={tone}>{t.status[status]}</Chip>;
}
