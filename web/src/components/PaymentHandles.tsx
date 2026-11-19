import type { PaymentHandles as Handles } from '@badmintonsmash/shared';

import { useT } from '@/i18n';

export function PaymentHandles({ handles }: { handles: Handles }) {
  const t = useT();
  const rows: [string, string | undefined][] = [
    [t.profile.etransfer, handles.etransfer],
    [t.profile.wechat, handles.wechat],
    [t.profile.alipay, handles.alipay],
    [t.profile.paypal, handles.paypal],
    [t.profile.venmo, handles.venmo],
    [t.profile.zelle, handles.zelle],
    [t.profile.other, handles.other],
  ];
  const present = rows.filter((r): r is [string, string] => !!r[1]);
  if (present.length === 0) return null;
  return (
    <div className="list small">
      {present.map(([label, value]) => (
        <div className="item" key={label}>
          <span className="muted">{label}</span>
          <span className="right pre">{value}</span>
        </div>
      ))}
    </div>
  );
}
