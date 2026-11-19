import { Link } from 'react-router-dom';

import { useMoney, useUpdateMySignup } from '@/api/hooks';
import { PaymentHandles } from '@/components/PaymentHandles';
import { Banner, Button, Card, Chip, Empty, Spinner } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';
import { formatCents, formatDate } from '@/lib/format';

function ClaimPaid({ eventId }: { eventId: string }) {
  const t = useT();
  const m = useUpdateMySignup(eventId);
  return (
    <Button variant="secondary" small loading={m.isPending} onClick={() => m.mutate({ claimedPaid: true })}>
      {t.event.iHavePaid}
    </Button>
  );
}

export function MoneyPage() {
  const t = useT();
  const locale = useLocale();
  const q = useMoney();
  if (q.isPending) return <Spinner />;
  if (q.error) return <Banner tone="error">{errorMessage(q.error)}</Banner>;
  const { owed, owedToMe } = q.data;
  return (
    <>
      <h1>{t.money.title}</h1>
      <h2>{t.money.owe}</h2>
      {owed.length === 0 ? <Empty>{t.money.empty}</Empty> : null}
      {owed.map((o) => (
        <Card key={o.eventId}>
          <div className="row between">
            <Link to={`/e/${o.eventId}`} className="title">
              {o.title}
            </Link>
            <Chip tone={o.paymentStatus === 'paid' ? 'ok' : o.paymentStatus === 'waived' ? undefined : 'warn'}>{t.payment[o.paymentStatus]}</Chip>
          </div>
          <div className="muted small">{formatDate(o.startsAt, o.timezone, locale)}</div>
          <div className="row between">
            <span className="title">{formatCents(o.amountOwedCents, o.currency, locale)}</span>
            <span className="muted small">{t.money.payTo(o.hostDisplayName)}</span>
          </div>
          <PaymentHandles handles={o.paymentHandles} />
          {o.paymentStatus === 'unpaid' ? (o.claimedPaidAt ? <span className="muted small">{t.event.claimedPaid}</span> : <ClaimPaid eventId={o.eventId} />) : null}
        </Card>
      ))}
      <h2>{t.money.owedToMe}</h2>
      {owedToMe.length === 0 ? <Empty>{t.money.empty}</Empty> : null}
      {owedToMe.map((o) => (
        <Card key={o.eventId}>
          <div className="row between">
            <Link to={`/e/${o.eventId}/roster`} className="title">
              {o.title}
            </Link>
            <span className="muted small">{formatDate(o.startsAt, o.timezone, locale)}</span>
          </div>
          <div className="row small">
            <span>
              {t.money.collected} {formatCents(o.collectedCents, o.currency, locale)}
            </span>
            <span>
              · {t.money.outstanding} {formatCents(o.outstandingCents, o.currency, locale)}
            </span>
            {o.waivedCents > 0 ? (
              <span>
                · {t.money.waived} {formatCents(o.waivedCents, o.currency, locale)}
              </span>
            ) : null}
          </div>
          <div className="muted small">{t.money.paidCount(o.paidCount, o.unpaidCount)}</div>
        </Card>
      ))}
    </>
  );
}
