import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-6 ${className}`}>
      {(title || action) && (
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-lg font-semibold text-fg">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({
  loading,
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: "primary" | "ghost";
}) {
  const styles =
    variant === "primary"
      ? "bg-accent text-white hover:bg-accent-strong disabled:bg-accent/40"
      : "border border-line text-fg hover:bg-white/5 disabled:opacity-50";
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium transition disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-11 w-full rounded-xl border border-line bg-bg px-4 text-sm text-fg outline-none placeholder:text-muted/60 focus:border-accent ${props.className ?? ""}`}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Spinner() {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
  );
}

export function Notice({ tone, children }: { tone: "info" | "success" | "error"; children: ReactNode }) {
  const styles = {
    info: "border-accent/30 bg-accent/10 text-fg",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    error: "border-red-500/30 bg-red-500/10 text-red-300",
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function TokenIcon({ image, symbol, size = 36 }: { image?: string | null; symbol?: string; size?: number }) {
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt={symbol ?? "token"}
      width={size}
      height={size}
      className="shrink-0 rounded-full border border-line object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent"
      style={{ width: size, height: size }}
    >
      {(symbol ?? "?").slice(0, 3)}
    </span>
  );
}
