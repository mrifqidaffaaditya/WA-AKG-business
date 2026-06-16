"use client";

import { useEffect, useRef, useCallback } from "react";
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  type?: "success" | "error" | "warning" | "info";
  isConfirm?: boolean;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  children?: React.ReactNode;
}

const typeConfig = {
  // amber/warning buttons use near-black ink for AA contrast on the bright fill.
  success: {
    icon: CheckCircle,
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    btn: "bg-amber-500 hover:bg-amber-400 text-slate-950",
  },
  error: {
    icon: AlertCircle,
    border: "border-rose-500/30",
    bg: "bg-rose-500/10",
    text: "text-rose-400",
    btn: "bg-rose-500 hover:bg-rose-600 text-white",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-orange-500/30",
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    btn: "bg-orange-500 hover:bg-orange-400 text-slate-950",
  },
  info: {
    icon: Info,
    border: "border-sky-500/30",
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    btn: "bg-sky-500 hover:bg-sky-600 text-white",
  },
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

export default function Modal({
  isOpen,
  onClose,
  title,
  message,
  type = "info",
  isConfirm = false,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  children,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  // Keyboard handling: Escape closes, Tab is trapped within the dialog.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;

      const nodes = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => el.offsetParent !== null);
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  // Focus management + scroll lock run ONLY when the modal opens/closes.
  // Crucially this must NOT depend on handleKeyDown/onClose: those callbacks are
  // recreated on every parent render (e.g. each keystroke into a field inside
  // the modal), and re-running this effect would steal focus back to the first
  // element on every character typed.
  useEffect(() => {
    if (!isOpen) return;

    lastFocusedRef.current = document.activeElement as HTMLElement | null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Prefer the first text field so the user can type immediately; only fall
    // back to a generic focusable (or the dialog) when there's no field. This
    // avoids landing focus on the close (X) button, which is first in the DOM.
    requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const field = dialog.querySelector<HTMLElement>(
        "input:not([type=hidden]), textarea, select"
      );
      (field || dialog).focus();
    });

    return () => {
      document.body.style.overflow = prevOverflow;
      lastFocusedRef.current?.focus?.();
    };
  }, [isOpen]);

  // Keydown handling (Escape + Tab trap) is attached separately so it can
  // safely re-bind when the callback identity changes, without touching focus.
  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const config = typeConfig[type];
  const Icon = config.icon;
  const headingId = "modal-title";

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title || isConfirm ? headingId : undefined}
        tabIndex={-1}
        className={
          "relative w-full max-w-md rounded-xl border bg-slate-900 p-6 shadow-2xl animate-scaleUp focus:outline-none " +
          config.border
        }
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup dialog"
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors cursor-pointer"
        >
          <X size={18} />
        </button>

        {(title || isConfirm) && (
          <div className="flex items-center gap-3 mb-4">
            <div className={"rounded-full p-2 " + config.bg}>
              <Icon size={20} className={config.text} aria-hidden="true" />
            </div>
            <h2 id={headingId} className="text-lg font-semibold text-slate-100">
              {title || "Konfirmasi"}
            </h2>
          </div>
        )}

        {message && (
          <p className="text-slate-300 mb-6 whitespace-pre-wrap">{message}</p>
        )}

        {children}

        {isConfirm && (
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm?.();
                onClose();
              }}
              className={"px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer " + config.btn}
            >
              {confirmText}
            </button>
          </div>
        )}

        {!isConfirm && !children && (
          <button
            type="button"
            onClick={onClose}
            className={"w-full rounded-lg py-2 font-medium transition-colors cursor-pointer " + config.btn}
          >
            OK
          </button>
        )}
      </div>
    </div>
  );
}
