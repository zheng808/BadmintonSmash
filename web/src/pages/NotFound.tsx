import { Link } from 'react-router-dom';

import { useT } from '@/i18n';

export function NotFoundPage() {
  const t = useT();
  return (
    <div className="empty">
      <h1>{t.common.notFoundTitle}</h1>
      <Link to="/" className="btn">
        {t.common.goHome}
      </Link>
    </div>
  );
}
