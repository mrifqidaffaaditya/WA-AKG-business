"use client";

/**
 * Shared, accessible UI primitives.
 *
 * These replace the copy-pasted toggle/button/spinner/badge markup that was
 * duplicated across the admin panels, chat, and shell. Centralising them keeps
 * the warm-charcoal + amber palette consistent and the a11y attributes correct
 * in one place.
 */

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/* ─────────────────────────────  Spinner  ───────────────────────────── */

export function Spinner({
  size = 16,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Memuat"
      style={{ width: size, height: size }}
      className={
        "inline-block rounded-full border-2 border-slate-600 border-t-amber-500 animate-spin " +
        className
      }
    />
  );
}

/* ─────────────────────────────  Toggle  ───────────────────────────── */

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer " +
        (checked ? "bg-amber-500" : "bg-slate-700")
      }
    >
      <span
        className={
          "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 " +
          (checked ? "translate-x-6" : "translate-x-1")
        }
      />
    </button>
  );
}

/* ─────────────────────────────  Button  ───────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variantClasses: Record<Variant, string> = {
  // amber-500 fails AA against white, so primary uses near-black ink text.
  primary:
    "bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 active:scale-[0.98]",
  secondary:
    "bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700",
  ghost: "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50",
  danger: "bg-rose-500 text-white hover:bg-rose-600 active:scale-[0.98]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", loading = false, icon, children, className = "", disabled, ...rest },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={
          "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed " +
          variantClasses[variant] +
          " " +
          className
        }
        {...rest}
      >
        {loading ? <Spinner size={16} /> : icon}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

/* ───────────────────────────  StatusBadge  ─────────────────────────── */

export type ConvStatus = "bot" | "waiting" | "active" | "resolved" | "hold";

const statusMeta: Record<ConvStatus, { label: string; chip: string; dot: string }> = {
  active: {
    label: "Aktif",
    chip: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    dot: "bg-amber-400",
  },
  waiting: {
    label: "Menunggu",
    chip: "bg-rose-500/10 text-rose-400 border-rose-500/25",
    dot: "bg-rose-400",
  },
  bot: {
    label: "Bot",
    chip: "bg-sky-500/10 text-sky-400 border-sky-500/25",
    dot: "bg-sky-400",
  },
  resolved: {
    label: "Selesai",
    chip: "bg-stone-500/10 text-stone-400 border-stone-500/25",
    dot: "bg-stone-500",
  },
  hold: {
    label: "Ditahan",
    chip: "bg-orange-500/10 text-orange-400 border-orange-500/25",
    dot: "bg-orange-400",
  },
};

export function StatusBadge({
  status,
  pulse = false,
}: {
  status: ConvStatus | string;
  pulse?: boolean;
}) {
  const meta = statusMeta[(status as ConvStatus)] || statusMeta.bot;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold " +
        meta.chip
      }
    >
      <span
        className={
          "h-1.5 w-1.5 rounded-full " + meta.dot + (pulse ? " animate-pulse-dot" : "")
        }
      />
      {meta.label}
    </span>
  );
}

export { statusMeta };
