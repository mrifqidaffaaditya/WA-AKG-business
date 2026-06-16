"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageCircle, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-amber-500 animate-spin" />
            <span className="text-sm">Memuat...</span>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [forceShow, setForceShow] = useState(false);
  const forceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist return_to across navigation via sessionStorage
  const returnToParam = searchParams.get("return_to") || "";
  const returnTo =
    returnToParam ||
    (typeof window !== "undefined"
      ? sessionStorage.getItem("return_to") || ""
      : "");

  useEffect(() => {
    if (returnToParam) {
      sessionStorage.setItem("return_to", returnToParam);
    }
  }, [returnToParam]);

  useEffect(() => {
    if (loading) {
      forceTimerRef.current = setTimeout(() => setForceShow(true), 8000);
    } else {
      if (forceTimerRef.current) clearTimeout(forceTimerRef.current);
    }
    return () => {
      if (forceTimerRef.current) clearTimeout(forceTimerRef.current);
    };
  }, [loading]);

  useEffect(() => {
    if (!loading && user) {
      const saved = sessionStorage.getItem("return_to") || "";
      sessionStorage.removeItem("return_to");

      let target = saved || returnTo || "";
      // Validate: only allow same-origin paths starting with /
      if (!target.startsWith("/") || target.startsWith("/login")) {
        target = "";
      }

      const fallback = user.role === "cs" ? "/cs" : "/admin";
      router.replace(target || fallback);
    }
  }, [loading, user, router, returnTo]);

  if (loading && !forceShow) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-amber-500 animate-spin" />
          <span className="text-sm">Memuat...</span>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-amber-500 animate-spin" />
          <span className="text-sm">Mengalihkan...</span>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login gagal. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 px-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(245,158,11,0.05),transparent_50%)]" />

      <div className="relative w-full max-w-md animate-scaleUp">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-500/5 border border-amber-500/10 flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_rgba(245,158,11,0.10)]">
            <MessageCircle size={26} className="text-amber-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">
            WA-AKG Business
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            WhatsApp Customer Service Management
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg shadow-black/20">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-slate-400 mb-1.5">
                Email
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  autoComplete="email"
                  autoFocus
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-slate-400 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3.5 py-3 flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                <p className="text-xs text-rose-400 leading-relaxed">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 text-sm font-medium text-slate-950 hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Masuk...
                </>
              ) : (
                <>
                  Masuk
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-[11px] text-slate-600">
          WA-AKG Business &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
