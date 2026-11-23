"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import Modal from "@/components/Modal";
import {
  Key,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  Code,
  Terminal,
  ExternalLink,
  Lock,
  AlertTriangle,
} from "lucide-react";

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

const AVAILABLE_SCOPES = [
  { id: "*", label: "Full Access (*)", desc: "Akses penuh ke semua endpoint API" },
  { id: "messages:send", label: "Kirim Pesan (messages:send)", desc: "Mengirim pesan teks dan media WhatsApp" },
  { id: "messages:broadcast", label: "Broadcast Pesan (messages:broadcast)", desc: "Mengirim pesan massal ke banyak nomor" },
  { id: "conversations:read", label: "Baca Percakapan (conversations:read)", desc: "Melihat daftar percakapan dan pesan" },
  { id: "conversations:write", label: "Kelola Percakapan (conversations:write)", desc: "Membalas dan mengubah status percakapan" },
  { id: "stock:read", label: "Baca Stok (stock:read)", desc: "Melihat daftar persediaan produk" },
  { id: "stock:write", label: "Sinkronisasi Stok (stock:write)", desc: "Memicu sinkronisasi stok" },
  { id: "admin", label: "Admin Gateway & Webhooks (admin)", desc: "Akses status gateway dan webhook" },
];

export default function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Create Key Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [permissions, setPermissions] = useState<string[]>(["*"]);
  const [creating, setCreating] = useState(false);

  // New Key Generated Modal
  const [newKeyModal, setNewKeyModal] = useState<{
    isOpen: boolean;
    rawKey: string;
    name: string;
  }>({ isOpen: false, rawKey: "", name: "" });
  const [copiedNewKey, setCopiedNewKey] = useState(false);

  // Active Code Snippet Tab
  const [codeTab, setCodeTab] = useState<"curl" | "node" | "python" | "verify">("curl");

  // Delete Confirm Modal State
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    id: string;
    name: string;
  }>({ isOpen: false, id: "", name: "" });

  // Feedback Modal
  const [feedback, setFeedback] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "info";
  }>({ isOpen: false, title: "", message: "", type: "info" });

  const loadKeys = async () => {
    try {
      const res = await apiFetch("/api/admin/api-keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleToggleScope = (scopeId: string) => {
    if (scopeId === "*") {
      setPermissions(["*"]);
      return;
    }
    const withoutAll = permissions.filter((p) => p !== "*");
    if (withoutAll.includes(scopeId)) {
      const updated = withoutAll.filter((p) => p !== scopeId);
      setPermissions(updated.length === 0 ? ["*"] : updated);
    } else {
      setPermissions([...withoutAll, scopeId]);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    setCreating(true);
    try {
      const res = await apiFetch("/api/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({
          name: keyName.trim(),
          permissions,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setIsCreateOpen(false);
        setKeyName("");
        setPermissions(["*"]);
        loadKeys();

        // Show the one-time raw key modal
        setNewKeyModal({
          isOpen: true,
          rawKey: data.rawKey,
          name: data.name,
        });
      } else {
        const err = await res.json();
        setFeedback({
          isOpen: true,
          title: "Gagal Membuat Key",
          message: err.error || "Gagal membuat API Key baru.",
          type: "error",
        });
      }
    } catch {
      setFeedback({
        isOpen: true,
        title: "Kesalahan Jaringan",
        message: "Tidak dapat terhubung ke server.",
        type: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const res = await apiFetch(`/api/admin/api-keys/${id}/toggle`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      if (res.ok) {
        setKeys((prev) =>
          prev.map((k) => (k.id === id ? { ...k, isActive: !currentStatus } : k))
        );
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteKey = (id: string, name: string) => {
    setDeleteConfirm({ isOpen: true, id, name });
  };

  const confirmDeleteKey = async () => {
    const { id, name } = deleteConfirm;
    setDeleteConfirm({ isOpen: false, id: "", name: "" });
    try {
      const res = await apiFetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
        setFeedback({
          isOpen: true,
          title: "Kunci Direvoke",
          message: `API Key "${name}" telah berhasil dihapus.`,
          type: "success",
        });
      }
    } catch {
      // ignore
    }
  };

  const copyToClipboard = (text: string, isNewKeyModal = false) => {
    navigator.clipboard.writeText(text);
    if (isNewKeyModal) {
      setCopiedNewKey(true);
      setTimeout(() => setCopiedNewKey(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/30 border border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Key size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">API Keys & Developer Access</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Kelola kredensial autentikasi untuk integrasi REST API v1 eksternal dengan sistem keamanan tinggi.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadKeys}
            className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm transition-all shadow-lg shadow-amber-500/20"
          >
            <Plus size={16} />
            <span>Buat API Key Baru</span>
          </button>
        </div>
      </div>

      {/* Active API Keys List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <span>Daftar Kunci Aktif</span>
          <span className="text-xs font-normal text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
            {keys.length} Keys
          </span>
        </h3>

        {loading ? (
          <div className="p-12 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800/80">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-amber-400" />
            <p className="text-sm">Memuat API Keys...</p>
          </div>
        ) : keys.length === 0 ? (
          <div className="p-10 text-center bg-slate-900/30 rounded-2xl border border-dashed border-slate-800">
            <Key size={36} className="mx-auto text-slate-600 mb-3" />
            <h4 className="text-sm font-semibold text-slate-300">Belum ada API Key</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
              Buat API Key untuk mengizinkan aplikasi eksternal mengirim pesan WhatsApp atau membaca riwayat chat.
            </p>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
            >
              <Plus size={14} /> Buat Kunci Pertama
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {keys.map((k) => (
              <div
                key={k.id}
                className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 hover:border-slate-700/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-sm font-bold text-slate-100">{k.name}</span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
                        k.isActive
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}
                    >
                      {k.isActive ? "Aktif" : "Dinonaktifkan"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                    <span className="px-2 py-0.5 rounded bg-slate-950 text-amber-300 border border-slate-800">
                      {k.keyPrefix}
                    </span>
                    <span className="text-slate-600">|</span>
                    <span className="text-[11px] text-slate-500">
                      Terakhir dipakai: {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Belum pernah"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <span className="text-[11px] text-slate-500">Scopes:</span>
                    {k.permissions.includes("*") ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        Full Access (*)
                      </span>
                    ) : (
                      k.permissions.map((p) => (
                        <span
                          key={p}
                          className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/60"
                        >
                          {p}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center border-t md:border-t-0 pt-3 md:pt-0 border-slate-800 w-full md:w-auto justify-end">
                  <button
                    onClick={() => handleToggleActive(k.id, k.isActive)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
                      k.isActive
                        ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                    }`}
                  >
                    {k.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                  <button
                    onClick={() => handleDeleteKey(k.id, k.name)}
                    className="p-2 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
                    title="Revoke Key"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Code Integration Examples */}
      <div className="space-y-3 pt-4 border-t border-slate-800/80">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Terminal size={16} className="text-amber-400" />
            <span>Developer Quickstart & Code Examples</span>
          </h3>
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs">
            <button
              onClick={() => setCodeTab("curl")}
              className={`px-3 py-1 rounded-lg transition-colors ${
                codeTab === "curl" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              cURL
            </button>
            <button
              onClick={() => setCodeTab("node")}
              className={`px-3 py-1 rounded-lg transition-colors ${
                codeTab === "node" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Node.js
            </button>
            <button
              onClick={() => setCodeTab("python")}
              className={`px-3 py-1 rounded-lg transition-colors ${
                codeTab === "python" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Python
            </button>
            <button
              onClick={() => setCodeTab("verify")}
              className={`px-3 py-1 rounded-lg transition-colors ${
                codeTab === "verify" ? "bg-amber-500 text-slate-950 font-bold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Verifikasi Webhook
            </button>
          </div>
        </div>

        <div className="relative rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden">
          <div className="p-4 overflow-x-auto text-xs font-mono text-slate-300 leading-relaxed">
            {codeTab === "curl" && (
              <pre>{`# 1. Kirim pesan WhatsApp
curl -X POST https://wa-akg-business.aikeigroup.net/api/v1/messages/send \\
  -H "X-API-Key: akg_live_YOUR_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "6281234567890",
    "content": "Halo dari WA-AKG Business API!"
  }'

# 2. Broadcast ke banyak nomor
curl -X POST https://wa-akg-business.aikeigroup.net/api/v1/messages/broadcast \\
  -H "X-API-Key: akg_live_YOUR_KEY_HERE" \\
  -H "Content-Type: application/json" \\
  -d '{
    "recipients": ["6281234567890", "6289876543210"],
    "content": "Pemberitahuan penting untuk seluruh pelanggan."
  }'`}</pre>
            )}

            {codeTab === "node" && (
              <pre>{`// Kirim WhatsApp menggunakan fetch bawaan Node 18+
const res = await fetch("https://wa-akg-business.aikeigroup.net/api/v1/messages/send", {
  method: "POST",
  headers: {
    "X-API-Key": process.env.WA_AKG_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    to: "6281234567890",
    content: "Pesanan #12345 Anda telah dikirim via JNE!",
    contentType: "text",
  }),
});

const data = await res.json();
console.log("Status kirim:", data);`}</pre>
            )}

            {codeTab === "python" && (
              <pre>{`import requests

url = "https://wa-akg-business.aikeigroup.net/api/v1/messages/send"
headers = {
    "X-API-Key": "akg_live_YOUR_KEY_HERE",
    "Content-Type": "application/json"
}
payload = {
    "to": "6281234567890",
    "content": "Halo dari Python script!"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`}</pre>
            )}

            {codeTab === "verify" && (
              <pre>{`// Contoh verifikasi signature webhook di Express.js
import crypto from "crypto";

app.post("/webhook-endpoint", (req, res) => {
  const secret = process.env.WEBHOOK_SECRET;
  const signature = req.headers["x-wa-akg-signature"]; // e.g. sha256=abcdef...
  const rawBody = JSON.stringify(req.body);

  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    console.log("Signature valid! Event:", req.headers["x-wa-akg-event"]);
    // Process event: req.body.data
    res.status(200).send("OK");
  } else {
    res.status(401).send("Invalid signature");
  }
});`}</pre>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Create Key */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-900 border border-slate-800 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100">Buat API Key Baru</h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateKey} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nama / Identitas Kunci</label>
                <input
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="Contoh: Integrasi Zapier, CRM Backend, Skrip Otomasi"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-amber-500 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Pilih Hak Akses (Scopes)</label>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                  {AVAILABLE_SCOPES.map((scope) => (
                    <label
                      key={scope.id}
                      className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer hover:bg-slate-800/40"
                    >
                      <input
                        type="checkbox"
                        checked={permissions.includes("*") || permissions.includes(scope.id)}
                        disabled={scope.id !== "*" && permissions.includes("*")}
                        onChange={() => handleToggleScope(scope.id)}
                        className="rounded accent-amber-500 disabled:opacity-50"
                      />
                      <div>
                        <span className="text-xs font-semibold text-slate-200">{scope.label}</span>
                        <p className="text-[11px] text-slate-500">{scope.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {creating ? "Membuat Kunci..." : "Generate API Key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Key Created (Raw Key displayed once) */}
      {newKeyModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-900 border border-amber-500/40 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-400 border-b border-slate-800 pb-3">
              <ShieldCheck size={22} />
              <h3 className="text-base font-bold text-slate-100">API Key Berhasil Dibuat!</h3>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 flex gap-2.5">
              <AlertTriangle size={18} className="shrink-0 text-amber-400 mt-0.5" />
              <div>
                <span className="font-semibold block text-amber-300">PENTING: Salin Kunci Anda Sekarang</span>
                Demi keamanan dengan enkripsi zero-knowledge hash, kunci ini hanya ditampilkan SATU KALI dan tidak dapat dilihat lagi setelah jendela ini ditutup.
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400">Kunci API:</label>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-amber-400 break-all select-all">
                <span>{newKeyModal.rawKey}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <span className="text-[11px] text-slate-500">Nama: {newKeyModal.name}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(newKeyModal.rawKey, true)}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20"
                >
                  {copiedNewKey ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedNewKey ? "Tersalin ke Clipboard!" : "Salin Kunci"}</span>
                </button>
                <button
                  onClick={() => setNewKeyModal({ isOpen: false, rawKey: "", name: "" })}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
                >
                  Selesai
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, id: "", name: "" })}
        title="Revoke API Key"
        message={`Apakah Anda yakin ingin merevoke API Key "${deleteConfirm.name}"? Kunci ini tidak akan dapat digunakan lagi untuk memanggil API.`}
        type="warning"
        isConfirm
        confirmText="Revoke"
        cancelText="Batal"
        onConfirm={confirmDeleteKey}
      />

      <Modal
        isOpen={feedback.isOpen}
        onClose={() => setFeedback((f) => ({ ...f, isOpen: false }))}
        title={feedback.title}
        message={feedback.message}
        type={feedback.type}
      />
    </div>
  );
}
