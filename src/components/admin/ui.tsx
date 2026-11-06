"use client";
/**
 * Közös admin UI elemek (design: docs/design/06-components.md). Ikonközpontú, AA kontraszt, látható fókusz,
 * Framer Motion mozgás (reduced-motion tiszteletben tartva a MotionConfig-on keresztül).
 */
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Info, Loader2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border border-line bg-surface p-4", className)}>{children}</div>;
}

export function PageHeader({ title, right, back }: { title: string; right?: ReactNode; back?: string }) {
  const { t } = useTranslation();
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {back && (
          <a href={back} aria-label={t("common.back")} title={t("common.back")} className="grid size-11 place-items-center rounded-xl border border-line bg-surface hover:bg-alt">
            <ChevronLeft size={20} />
          </a>
        )}
        <h1 className="font-display text-2xl font-bold">{title}</h1>
      </div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "accent";
const toneClass: Record<Tone, string> = {
  neutral: "bg-alt text-ink",
  success: "bg-alt text-success",
  warning: "bg-alt text-warning",
  danger: "bg-alt text-danger",
  accent: "bg-soft text-accent",
};
/** Státusz-pill: ikon + szöveg (állapot sosem csak színnel). */
export function Pill({ tone = "neutral", icon, children, title }: { tone?: Tone; icon?: ReactNode; children?: ReactNode; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", toneClass[tone])}>
      {icon}
      {children}
    </span>
  );
}

export function IconButton({ label, children, onClick, tone = "neutral", disabled, type = "button" }: { label: string; children: ReactNode; onClick?: () => void; tone?: "neutral" | "accent" | "danger"; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "grid size-11 place-items-center rounded-xl border transition active:scale-[0.98] disabled:opacity-45",
        tone === "accent" ? "border-transparent bg-accent text-onaccent" : tone === "danger" ? "border-line bg-surface text-danger hover:bg-alt" : "border-line bg-surface hover:bg-alt",
      )}
    >
      {children}
    </button>
  );
}

export function Button({ children, onClick, tone = "primary", loading, disabled, type = "button", icon }: { children?: ReactNode; onClick?: () => void; tone?: "primary" | "secondary" | "danger"; loading?: boolean; disabled?: boolean; type?: "button" | "submit"; icon?: ReactNode }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={cx(
        "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-45",
        tone === "primary" && "bg-accent text-onaccent",
        tone === "secondary" && "border border-line bg-alt text-ink hover:bg-line",
        tone === "danger" && "bg-danger text-onaccent",
      )}
    >
      {loading ? <Loader2 size={18} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Field({ label, icon, error, hint, ...props }: { label: string; icon?: ReactNode; error?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-sm text-muted">
        {icon}
        {label}
      </label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error || hint ? `${id}-d` : undefined}
        {...props}
        className="h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-base outline-none focus-visible:border-accent"
      />
      {(error || hint) && (
        <p id={`${id}-d`} className={cx("mt-1 flex items-center gap-1 text-sm", error ? "text-danger" : "text-muted")}>
          {error && <AlertTriangle size={14} />}
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-alt", className)} aria-hidden="true" />;
}

export function EmptyState({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) {
  return (
    <div className="grid place-items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-12 text-center text-muted">
      <div className="text-accent">{icon}</div>
      <p>{text}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-danger">
      <AlertTriangle size={20} />
      <span className="flex-1">{message}</span>
      {onRetry && <Button tone="secondary" onClick={onRetry}>{t("common.retry")}</Button>}
    </div>
  );
}

/** Lapozó (ikonos). */
export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
      <span>{t("common.total")}: {total}</span>
      <div className="flex items-center gap-2">
        <IconButton label="‹" onClick={() => onPage(page - 1)} disabled={page <= 1}><ChevronLeft size={18} /></IconButton>
        <span aria-live="polite">{page} {t("common.of")} {pages}</span>
        <IconButton label="›" onClick={() => onPage(page + 1)} disabled={page >= pages}><ChevronRight size={18} /></IconButton>
      </div>
    </div>
  );
}

/** Modal: fókuszcsapda, Escape zár, Framer Motion belépés. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>("input,textarea,button,[tabindex]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && el) {
        const f = [...el.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex='-1'])")];
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-end bg-[var(--overlay)] p-0 sm:place-items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onMouseDown={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="max-h-[90dvh] w-full overflow-auto rounded-t-3xl border border-line bg-surface p-5 sm:max-w-md sm:rounded-3xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 id={titleId} className="font-display text-lg font-semibold">{title}</h2>
              <IconButton label="×" onClick={onClose}><X size={18} /></IconButton>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---- Toast ----
interface ToastItem { id: number; kind: "success" | "error" | "info"; text: string }
const ToastCtx = createContext<(kind: ToastItem["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((kind: ToastItem["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-20 right-4 z-[60] flex flex-col gap-2 lg:bottom-6" aria-live="polite">
        <AnimatePresence>
          {items.map((i) => (
            <motion.div key={i.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className="pointer-events-auto flex max-w-sm items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm shadow-lg">
              {i.kind === "success" ? <Check size={18} className="text-success" /> : i.kind === "error" ? <AlertTriangle size={18} className="text-danger" /> : <Info size={18} className="text-accent" />}
              <span>{i.text}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/** Lista-belépés stagger animáció (40 ms). */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.04 } } }}>
      {children}
    </motion.div>
  );
}
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.2, 0, 0, 1] } } }}>
      {children}
    </motion.div>
  );
}
