"use client";

import { useState } from "react";
import { FileCode2, ExternalLink, Download, ShieldCheck, Terminal, Webhook, Zap, BookOpen } from "lucide-react";

export default function DocsPanel() {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/30 border border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <FileCode2 size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Dokumentasi API & Webhooks (OpenAPI 3.0)</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Spesifikasi resmi REST API v1, format payload pesan, dan panduan integrasi sistem pihak ketiga.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/api/docs/openapi.json"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-medium transition-colors"
          >
            <Download size={14} />
            <span>OpenAPI JSON</span>
          </a>
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all shadow-lg shadow-emerald-600/20"
          >
            <ExternalLink size={14} />
            <span>Buka Fullscreen</span>
          </a>
        </div>
      </div>

      {/* Quick Specs Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
            <Terminal size={16} />
            <span>Base URL</span>
          </div>
          <code className="block p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-indigo-300 select-all">
            https://wa-akg-business.aikeigroup.net/api/v1
          </code>
          <p className="text-[11px] text-slate-500">Semua request API v1 diarahkan ke prefix ini.</p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold uppercase tracking-wider">
            <ShieldCheck size={16} />
            <span>Autentikasi</span>
          </div>
          <code className="block p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-amber-300 select-all">
            X-API-Key: akg_live_...
          </code>
          <p className="text-[11px] text-slate-500">Juga mendukung header Authorization: Bearer &lt;key&gt;.</p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            <Webhook size={16} />
            <span>Keamanan Webhook</span>
          </div>
          <code className="block p-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 select-all">
            X-WA-AKG-Signature: sha256=...
          </code>
          <p className="text-[11px] text-slate-500">Setiap payload ditandatangani dengan HMAC SHA-256 secret.</p>
        </div>
      </div>

      {/* Embedded Scalar / OpenAPI Documentation Frame */}
      <div className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl relative min-h-[750px]">
        {!iframeLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 text-slate-500 z-10">
            <div className="w-6 h-6 rounded-full border-2 border-slate-700 border-t-emerald-500 animate-spin" />
            <span className="text-xs">Memuat Interactive Documentation...</span>
          </div>
        )}
        <iframe
          src="/api/docs"
          title="Interactive API Documentation"
          onLoad={() => setIframeLoaded(true)}
          className="w-full h-[800px] border-none"
        />
      </div>
    </div>
  );
}
