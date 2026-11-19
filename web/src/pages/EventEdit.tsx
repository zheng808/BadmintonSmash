import { useParams } from 'react-router-dom';

import { useEvent, useMe } from '@/api/hooks';
import { EventForm } from '@/components/EventForm';
import { Banner, Spinner } from '@/components/ui';
import { useT } from '@/i18n';
import { errorMessage } from '@/lib/errors';

export function EventNewPage() {
  const me = useMe();
  if (me.isPending) return <Spinner />;
  return <EventForm mode="create" me={me.data} />;
}

export function EventEditPage() {
  const t = useT();
  const { id = '' } = useParams();
  const q = useEvent(id);
  if (q.isPending) return <Spinner />;
  if (q.error) return <Banner tone="error">{errorMessage(q.error)}</Banner>;
  if (q.data.kind !== 'detail' || !q.data.detail.me.isHost) return <Banner tone="error">{t.event.publicView}</Banner>;
  return <EventForm mode="edit" initial={q.data.detail.event} />;
}
