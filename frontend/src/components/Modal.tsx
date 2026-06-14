"use client";

import { useEffect, useRef } from "react";
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
  success: {
    icon: CheckCircle,
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    btn: "bg-emerald-500 hover:bg-emerald-600 text-white",
  },
  error: {
    icon: AlertCircle,
    border: "border-red-500/30",
    bg: "bg-red-500/10",
    text: "text-red-400",
    btn: "bg-red-500 hover:bg-red-600 text-white",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    btn: "bg-amber-500 hover:bg-amber-600 text-white",
  },
  info: {
    icon: Info,
    border: "border-blue-500/30",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    btn: "bg-blue-500 hover:bg-blue-600 text-white",
  },
};

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

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const config = typeConfig[type];
  const Icon = config.icon;

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
        className={
          "relative w-full max-w-md rounded-xl border bg-slate-900 p-6 shadow-2xl animate-scaleUp " +
          config.border
        }
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
        >
          <X size={18} />
        </button>

        {!isConfirm && title && (
          <div className="flex items-center gap-3 mb-4">
            <div className={"rounded-full p-2 " + config.bg}>
              <Icon size={20} className={config.text} />
            </div>
            <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
          </div>
        )}

        {isConfirm && (
          <div className="flex items-center gap-3 mb-4">
            <div className={"rounded-full p-2 " + config.bg}>
              <Icon size={20} className={config.text} />
            </div>
            <h2 className="text-lg font-semibold text-slate-100">
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
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm?.();
                onClose();
              }}
              className={"px-4 py-2 rounded-lg font-medium transition-colors " + config.btn}
            >
              {confirmText}
            </button>
          </div>
        )}

        {!isConfirm && !children && (
          <button
            onClick={onClose}
            className={"w-full rounded-lg py-2 font-medium transition-colors " + config.btn}
          >
            OK
          </button>
        )}
      </div>
    </div>
  );
}
