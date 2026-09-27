import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cx } from "../../lib/cx";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-contrast hover:bg-primary-hover",
  secondary: "bg-surface text-text border border-border hover:bg-surface-2",
  ghost: "text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }>(
  function Button({ variant = "primary", busy, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cx(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          variants[variant],
          className,
        )}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        {...rest}
      >
        {busy && <Spinner small />}
        {children}
      </button>
    );
  },
);

export function Card({ className, children, as: Tag = "section" }: { className?: string; children: ReactNode; as?: "section" | "article" | "div" }) {
  return <Tag className={cx("rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_0_rgba(0,0,0,0.02)]", className)}>{children}</Tag>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold leading-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Field({ label, hint, error, htmlFor, children }: { label: string; hint?: ReactNode; error?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p className="text-xs font-semibold text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const inputBase =
  "w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-base text-text placeholder:text-muted/70 focus:border-primary focus:outline-none";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputBase, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(inputBase, "min-h-28 leading-7", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cx(inputBase, "appearance-auto", className)} {...rest}>
      {children}
    </select>
  );
});

type Tone = "neutral" | "success" | "warning" | "danger" | "lamp" | "primary";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  success: "bg-success-bg text-success border-transparent",
  warning: "bg-warning-bg text-warning border-transparent",
  danger: "bg-danger-bg text-danger border-transparent",
  lamp: "bg-warning-bg text-lamp border-transparent",
  primary: "bg-surface-2 text-primary border-border",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function Banner({ tone = "neutral", title, children, role }: { tone?: Tone; title?: string; children?: ReactNode; role?: "alert" | "status" }) {
  return (
    <div role={role} className={cx("rounded-xl border px-4 py-3 text-sm", tones[tone])}>
      {title && <p className="font-bold">{title}</p>}
      {children && <div className={cx(title && "mt-1", "leading-7")}>{children}</div>}
    </div>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      role="status"
      aria-label="جارٍ التحميل"
      className={cx("inline-block animate-spin rounded-full border-2 border-current border-t-transparent", small ? "h-4 w-4" : "h-6 w-6")}
    />
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted">
      <Spinner /> <span>جارٍ التحميل…</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "حدث خطأ غير متوقع.";
  return (
    <Banner tone="warning" title="تعذّر عرض هذه الصفحة" role="alert">
      <p>{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-2" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      )}
    </Banner>
  );
}

/** حالة فارغة بإضاءة خافتة دافئة — references/13-visual-motion-design.md §13.4. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-border bg-surface px-6 py-14 text-center">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-4 h-40 w-40 -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--lamp-glow) 35%, transparent) 0%, transparent 70%)" }}
        animate={reduce ? { opacity: 0.6 } : { opacity: [0.35, 0.7, 0.35] }}
        transition={reduce ? { duration: 0 } : { duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      <p className="relative text-lg font-semibold">{title}</p>
      {children && <div className="relative mx-auto mt-2 max-w-md text-muted">{children}</div>}
    </div>
  );
}

export function Checkbox({ id, label, checked, onChange, hint }: { id: string; label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" className="mt-1.5 h-5 w-5 shrink-0 accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="text-sm leading-7">
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </label>
    </div>
  );
}
