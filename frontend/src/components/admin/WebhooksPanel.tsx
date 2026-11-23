"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { getIO } from "@/lib/socket";
import Modal from "@/components/Modal";
import {
  Webhook,
  Plus,
  Play,
  Trash2,
  Pencil,
  RefreshCw,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Sliders,
  AlertTriangle,
} from "lucide-react";

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DeliveryItem {
  id: string;
  webhookId: string;
  event: string;
  url: string;
  responseStatus: number | null;
  durationMs: number;
  success: boolean;
  errorMessage: string | null;
  attempt: number;
  createdAt: string;
  requestPayload?: string;
  responseBody?: string | null;
}

const AVAILABLE_EVENTS = [
  { id: "message.received", label: "Pesan Masuk (Customer)", desc: "Trigger saat customer mengirim pesan WhatsApp" },
  { id: "message.sent", label: "Pesan Keluar (Bot / CS)", desc: "Trigger saat bot atau CS membalas pesan" },
  { id: "conversation.created", label: "Percakapan Baru", desc: "Trigger saat percakapan baru terbentuk" },
  { id: "conversation.status_changed", label: "Perubahan Status", desc: "Trigger saat status berubah (waiting, active, hold, dll)" },
  { id: "conversation.claimed", label: "Percakapan Diklaim", desc: "Trigger saat CS mengambil chat" },
  { id: "conversation.resolved", label: "Percakapan Selesai", desc: "Trigger saat chat diselesaikan" },
  { id: "stock.updated", label: "Update Stok Produk", desc: "Trigger saat sinkronisasi stok berhasil" },
];

export default function WebhooksPanel() {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [copiedSecretId, setCopiedSecretId] = useState<string | null>(null);

  // Form Modal State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>(["*"]);
  const [formIsActive, setFormIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Inspect Modal State
  const [inspectModal, setInspectModal] = useState<{
    isOpen: boolean;
    title: string;
    content: string;
  }>({ isOpen: false, title: "", content: "" });

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

  const loadData = async () => {
    try {
      const [hooksRes, delivRes] = await Promise.all([
        apiFetch("/api/admin/webhooks"),
        apiFetch("/api/admin/webhooks/deliveries"),
      ]);

      if (hooksRes.ok) {
        const data = await hooksRes.json();
        setWebhooks(Array.isArray(data) ? data : []);
      }
      if (delivRes.ok) {
        const data = await delivRes.json();
        setDeliveries(Array.isArray(data) ? data : []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Listen to realtime webhook delivery socket event
    const socket = getIO();
    if (!socket) return;

    const handleDelivery = (delivery: DeliveryItem) => {
      setDeliveries((prev) => [delivery, ...prev.slice(0, 49)]);
    };

    socket.on("webhook:delivery", handleDelivery);
    return () => {
      socket.off("webhook:delivery", handleDelivery);
    };
  }, []);

  const openCreateModal = () => {
    setEditingId(null);
    setFormName("");
    setFormUrl("");
    setFormSecret("");
    setFormEvents(["*"]);
    setFormIsActive(true);
    setIsFormOpen(true);
  };

  const openEditModal = (h: WebhookItem) => {
    setEditingId(h.id);
    setFormName(h.name);
    setFormUrl(h.url);
    setFormSecret(h.secret);
    setFormEvents(h.events);
    setFormIsActive(h.isActive);
    setIsFormOpen(true);
  };

  const handleToggleEvent = (eventId: string) => {
    if (eventId === "*") {
      setFormEvents(["*"]);
      return;
    }

    const withoutAll = formEvents.filter((e) => e !== "*");
    if (withoutAll.includes(eventId)) {
      const updated = withoutAll.filter((e) => e !== eventId);
      setFormEvents(updated.length === 0 ? ["*"] : updated);
    } else {
      setFormEvents([...withoutAll, eventId]);
    }
  };

  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formUrl.trim()) {
      setFeedback({
        isOpen: true,
        title: "Validasi Gagal",
        message: "Nama webhook dan URL tujuan wajib diisi.",
        type: "error",
      });
      return;
    }

    setSubmitting(true);
    try {
      const url = editingId ? `/api/admin/webhooks/${editingId}` : "/api/admin/webhooks";
      const method = editingId ? "PUT" : "POST";

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({
          name: formName.trim(),
          url: formUrl.trim(),
          secret: formSecret.trim() || undefined,
          events: formEvents,
          isActive: formIsActive,
        }),
      });

      if (res.ok) {
        setIsFormOpen(false);
        loadData();
        setFeedback({
          isOpen: true,
          title: "Berhasil",
          message: editingId ? "Webhook berhasil diperbarui." : "Webhook baru berhasil didaftarkan.",
          type: "success",
        });
      } else {
        const err = await res.json();
        setFeedback({
          isOpen: true,
          title: "Gagal Menyimpan",
          message: err.error || "Terjadi kesalahan saat menyimpan webhook.",
          type: "error",
        });
      }
    } catch {
      setFeedback({
        isOpen: true,
        title: "Kesalahan Jaringan",
        message: "Gagal menghubungi server backend.",
        type: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestPing = async (id: string, name: string) => {
    setTestingId(id);
    try {
      const res = await apiFetch(`/api/admin/webhooks/${id}/test`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          isOpen: true,
          title: "Ping Berhasil! (200 OK)",
          message: `Endpoint ${name} berhasil merespon test ping dengan status ${data.status || 200}.`,
          type: "success",
        });
      } else {
        setFeedback({
          isOpen: true,
          title: "Ping Gagal",
          message: `Endpoint ${name} gagal merespon: ${data.error || "Status " + data.status}`,
          type: "error",
        });
      }
      loadData();
    } catch {
      setFeedback({
        isOpen: true,
        title: "Error",
        message: "Gagal mengirim test ping.",
        type: "error",
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = (id: string, name: string) => {
    setDeleteConfirm({ isOpen: true, id, name });
  };

  const confirmDelete = async () => {
    const { id, name } = deleteConfirm;
    setDeleteConfirm({ isOpen: false, id: "", name: "" });
    try {
      const res = await apiFetch(`/api/admin/webhooks/${id}`, { method: "DELETE" });
      if (res.ok) {
        setWebhooks((prev) => prev.filter((h) => h.id !== id));
        setFeedback({
          isOpen: true,
          title: "Terhapus",
          message: `Webhook ${name} telah dihapus.`,
          type: "success",
        });
      }
    } catch {
      // ignore
    }
  };

  const copySecret = (id: string, secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecretId(id);
    setTimeout(() => setCopiedSecretId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Webhook size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Webhooks & Realtime Streaming</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Kirim event WhatsApp, percakapan, dan stok langsung ke CRM, Zapier, n8n, atau server Anda secara realtime.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/20"
          >
            <Plus size={16} />
            <span>Tambah Webhook</span>
          </button>
        </div>
      </div>

      {/* Webhooks Endpoints List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <span>Endpoints Terdaftar</span>
          <span className="text-xs font-normal text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
            {webhooks.length} Active
          </span>
        </h3>

        {loading ? (
          <div className="p-12 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800/80">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-400" />
            <p className="text-sm">Memuat daftar webhook...</p>
          </div>
        ) : webhooks.length === 0 ? (
          <div className="p-10 text-center bg-slate-900/30 rounded-2xl border border-dashed border-slate-800">
            <Webhook size={36} className="mx-auto text-slate-600 mb-3" />
            <h4 className="text-sm font-semibold text-slate-300">Belum ada Webhook terdaftar</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
              Daftarkan URL HTTP/HTTPS untuk menerima notifikasi otomatis saat pesan WhatsApp diterima atau CS merespons.
            </p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
            >
              <Plus size={14} /> Buat Webhook Pertama
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {webhooks.map((hook) => (
              <div
                key={hook.id}
                className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 hover:border-slate-700/80 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-sm font-bold text-slate-100">{hook.name}</span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
                        hook.isActive
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-slate-800 text-slate-400 border-slate-700"
                      }`}
                    >
                      {hook.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-400 font-mono break-all">
                    <span className="px-1.5 py-0.5 rounded bg-slate-950 text-indigo-300 border border-slate-800">
                      POST
                    </span>
                    <span>{hook.url}</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <span className="text-[11px] text-slate-500">Events:</span>
                    {hook.events.includes("*") ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        Semua Event (*)
                      </span>
                    ) : (
                      hook.events.map((ev) => (
                        <span
                          key={ev}
                          className="text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/60"
                        >
                          {ev}
                        </span>
                      ))
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-0.5">
                    <span>Secret:</span>
                    <code className="text-slate-400 font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {hook.secret.slice(0, 8)}••••••••••••••••••••••••
                    </code>
                    <button
                      onClick={() => copySecret(hook.id, hook.secret)}
                      className="p-1 text-slate-400 hover:text-indigo-400 transition-colors"
                      title="Salin Secret"
                    >
                      {copiedSecretId === hook.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center border-t md:border-t-0 pt-3 md:pt-0 border-slate-800 w-full md:w-auto justify-end">
                  <button
                    onClick={() => handleTestPing(hook.id, hook.name)}
                    disabled={testingId === hook.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    <Play size={13} className={testingId === hook.id ? "animate-spin" : ""} />
                    <span>{testingId === hook.id ? "Testing..." : "Test Ping"}</span>
                  </button>
                  <button
                    onClick={() => openEditModal(hook)}
                    className="p-2 rounded-xl border border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                    title="Edit Webhook"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(hook.id, hook.name)}
                    className="p-2 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
                    title="Hapus Webhook"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Webhook Deliveries Log */}
      <div className="space-y-3 pt-4 border-t border-slate-800/80">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span>Riwayat Pengiriman Realtime</span>
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Socket
            </span>
          </h3>
          <span className="text-xs text-slate-500">{deliveries.length} logs tersimpan</span>
        </div>

        {deliveries.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/30 rounded-2xl border border-slate-800 text-slate-500 text-xs">
            Belum ada log pengiriman webhook tercatat. Log akan muncul otomatis saat event terjadi atau saat Anda menekan Test Ping.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Event</th>
                  <th className="py-3 px-4">Target URL</th>
                  <th className="py-3 px-4">Latency</th>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4 text-right">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {deliveries.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-sans">
                      {d.success ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 size={12} />
                          {d.responseStatus || "200"} OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <XCircle size={12} />
                          {d.responseStatus || "ERR"} {d.errorMessage ? `(${d.errorMessage.slice(0, 15)})` : ""}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-indigo-300 font-semibold">{d.event}</td>
                    <td className="py-3 px-4 text-slate-400 max-w-xs truncate">{d.url}</td>
                    <td className="py-3 px-4 text-slate-400 font-sans">{d.durationMs}ms</td>
                    <td className="py-3 px-4 text-slate-500 font-sans whitespace-nowrap">
                      {new Date(d.createdAt).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4 text-right font-sans">
                      <div className="flex items-center justify-end gap-1.5">
                        {d.requestPayload && (
                          <button
                            onClick={() =>
                              setInspectModal({
                                isOpen: true,
                                title: `Payload: ${d.event}`,
                                content: d.requestPayload || "{}",
                              })
                            }
                            className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200"
                            title="Lihat Request Payload"
                          >
                            <Eye size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Form Modal (Create / Edit) */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-900 border border-slate-800 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100">
                {editingId ? "Edit Webhook" : "Daftarkan Webhook Baru"}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveWebhook} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Nama Endpoint</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: CRM Lead Ingest, Zapier Sync, ERP System"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Target URL (HTTP / HTTPS)</label>
                <input
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://your-crm.com/api/webhooks"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs font-mono"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Harus URL publik yang valid. Server akan mengirim HTTP POST dengan body JSON dan header tanda tangan HMAC SHA-256.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Secret Key (Opsional, min 16 karakter)
                </label>
                <input
                  type="text"
                  value={formSecret}
                  onChange={(e) => setFormSecret(e.target.value)}
                  placeholder="Biarkan kosong untuk otomatis dibuatkan random 32-byte hex"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Pilih Langganan Event</label>
                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  <label className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer hover:bg-slate-800/40">
                    <input
                      type="checkbox"
                      checked={formEvents.includes("*")}
                      onChange={() => handleToggleEvent("*")}
                      className="rounded accent-indigo-500"
                    />
                    <div>
                      <span className="text-xs font-semibold text-amber-300">Semua Event (*)</span>
                      <p className="text-[11px] text-slate-500">Menerima semua aktivitas WhatsApp secara otomatis</p>
                    </div>
                  </label>

                  {AVAILABLE_EVENTS.map((ev) => (
                    <label
                      key={ev.id}
                      className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800/80 cursor-pointer hover:bg-slate-800/40"
                    >
                      <input
                        type="checkbox"
                        checked={formEvents.includes("*") || formEvents.includes(ev.id)}
                        disabled={formEvents.includes("*")}
                        onChange={() => handleToggleEvent(ev.id)}
                        className="rounded accent-indigo-500 disabled:opacity-50"
                      />
                      <div>
                        <span className="text-xs font-medium text-slate-200">{ev.label}</span>
                        <p className="text-[11px] text-slate-500 font-mono">{ev.id}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded accent-indigo-500"
                />
                <label htmlFor="isActiveToggle" className="text-xs text-slate-300 cursor-pointer">
                  Aktifkan Webhook Sekarang
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {submitting ? "Menyimpan..." : editingId ? "Perbarui Webhook" : "Simpan Webhook"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Modal */}
      {inspectModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-slate-100">{inspectModal.title}</h3>
              <button
                onClick={() => setInspectModal({ isOpen: false, title: "", content: "" })}
                className="text-slate-400 hover:text-slate-200 text-xs font-semibold"
              >
                ✕
              </button>
            </div>
            <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-xs text-indigo-300 font-mono overflow-auto max-h-80 whitespace-pre-wrap">
              {(() => {
                try {
                  return JSON.stringify(JSON.parse(inspectModal.content), null, 2);
                } catch {
                  return inspectModal.content;
                }
              })()}
            </pre>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setInspectModal({ isOpen: false, title: "", content: "" })}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, id: "", name: "" })}
        title="Hapus Webhook"
        message={`Apakah Anda yakin ingin menghapus webhook "${deleteConfirm.name}"? Tindakan ini tidak dapat dibatalkan.`}
        type="warning"
        isConfirm
        confirmText="Hapus"
        cancelText="Batal"
        onConfirm={confirmDelete}
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
