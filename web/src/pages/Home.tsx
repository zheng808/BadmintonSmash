import type { EventScope } from '@badmintonsmash/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useEvents } from '@/api/hooks';
import { EventCard } from '@/components/EventCard';
import { Banner, Empty, Segmented, Spinner } from '@/components/ui';
import { useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';

export function HomePage() {
  const t = useT();
  const [scope, setScope] = useState<EventScope>('upcoming');
  const q = useEvents(scope);
  const empty = { upcoming: t.home.emptyUpcoming, hosting: t.home.emptyHosting, past: t.home.emptyPast }[scope];
  return (
    <>
      <div className="row between">
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            { value: 'upcoming', label: t.home.upcoming },
            { value: 'hosting', label: t.home.hosting },
            { value: 'past', label: t.home.past },
          ]}
        />
      </div>
      <Link to="/events/new" className="btn block">
        ＋ {t.home.newEvent}
      </Link>
      {q.isPending ? <Spinner /> : null}
      {q.error ? <Banner tone="error">{errorMessage(q.error)}</Banner> : null}
      {q.data ? (q.data.items.length === 0 ? <Empty>{empty}</Empty> : q.data.items.map((e) => <EventCard key={e.eventId} e={e} />)) : null}
    </>
  );
}
