import { useState } from 'react';

import { usePublicEvents } from '@/api/hooks';
import { EventCard } from '@/components/EventCard';
import { Banner, Empty, Spinner } from '@/components/ui';
import { useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';

export function ExplorePage() {
  const t = useT();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const list = usePublicEvents(q);
  return (
    <>
      <h1>{t.explore.title}</h1>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(text.trim());
        }}>
        <input className="input grow" type="search" placeholder={t.explore.search} value={text} onChange={(e) => setText(e.target.value)} />
      </form>
      {list.isPending ? <Spinner /> : null}
      {list.error ? <Banner tone="error">{errorMessage(list.error)}</Banner> : null}
      {list.data ? (list.data.items.length === 0 ? <Empty>{t.explore.empty}</Empty> : list.data.items.map((e) => <EventCard key={e.eventId} e={e} />)) : null}
    </>
  );
}
