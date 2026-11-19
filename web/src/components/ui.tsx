import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  loading,
  block,
  small,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; block?: boolean; small?: boolean }) {
  const cls = ['btn', variant !== 'primary' ? variant : '', block ? 'block' : '', small ? 'sm' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} disabled={disabled || loading} {...rest}>
      {loading ? <span className="spin" style={{ margin: 0 }} /> : null}
      {children}
    </button>
  );
}

export function Field({ label, hint, error, optional, children }: { label: string; hint?: string; error?: string; optional?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">
        {label} {optional ? <em>({optional})</em> : null}
      </span>
      {children}
      {hint && !error ? <span className="hint">{hint}</span> : null}
      {error ? <span className="error">{error}</span> : null}
    </label>
  );
}

export function Check({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="field">
      {label ? <span className="label">{label}</span> : null}
      <div className="seg" role="tablist">
        {options.map((o) => (
          <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Chip({ tone, children }: { tone?: 'ok' | 'warn' | 'danger' | 'primary'; children: ReactNode }) {
  return <span className={`chip ${tone ?? ''}`}>{children}</span>;
}

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  return (
    <div className={`banner ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Spinner() {
  return <div className="spin" aria-label="loading" />;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className ?? ''}`}>{children}</section>;
}
