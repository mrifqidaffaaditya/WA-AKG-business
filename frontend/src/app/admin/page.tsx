"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DashboardShell from "@/components/DashboardShell";
import Modal from "@/components/Modal";
import { useAuth } from "@/hooks/useAuth";
import { connect, getIO } from "@/lib/socket";
import { apiFetch } from "@/lib/api";
import { setupPushNotifications } from "@/lib/push";
import {
  Bot,
  Package,
  Users,
  Radio,
  ClipboardList,
  RefreshCw,
  Trash2,
  UserPlus,
  Power,
  Save,
  Eye,
  LayoutDashboard,
  MessageSquare,
  UserCheck,
  Star,
  TrendingUp,
  Clock,
  Wifi,
  WifiOff,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Link2,
} from "lucide-react";

type TabType = "dashboard" | "bot" | "stock" | "users" | "gateway" | "audit";

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <DashboardShell>
          <div className="flex items-center justify-center h-full text-slate-500">
            <span className="animate-pulse">Memuat...</span>
          </div>
        </DashboardShell>
      }
    >
      <AdminContent />
    </Suspense>
  );
}

function AdminContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const tabParam = searchParams.get("tab") as TabType | null;
  const [activeTab, setActiveTab] = useState<TabType>(tabParam || "dashboard");

  useEffect(() => {
    setupPushNotifications();
    connect();
    return () => {};
  }, []);

  const updateTab = (tab: TabType) => {
    setActiveTab(tab);
    router.replace("/admin?tab=" + tab, { scroll: false });
  };

  const tabs: { key: TabType; label: string; icon: React.ElementType }[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "bot", label: "Bot Config", icon: Bot },
    { key: "stock", label: "Stok", icon: Package },
    { key: "users", label: "Users", icon: Users },
    { key: "gateway", label: "Gateway", icon: Radio },
    { key: "audit", label: "Audit Log", icon: ClipboardList },
  ];

  return (
    <DashboardShell>
      <div className="flex flex-col h-full">
        <div className="flex items-center border-b border-slate-800 px-4 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => updateTab(tab.key)}
              className={
                "relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors " +
                (activeTab === tab.key
                  ? "text-emerald-400"
                  : "text-slate-400 hover:text-slate-200")
              }
            >
              <tab.icon size={16} />
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500 rounded-full" />
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "dashboard" && <DashboardPanel />}
          {activeTab === "bot" && <BotConfigPanel />}
          {activeTab === "stock" && <StockConfigPanel />}
          {activeTab === "users" && <UserPanel />}
          {activeTab === "gateway" && <GatewayPanel />}
          {activeTab === "audit" && <AuditPanel />}
        </div>
      </div>
    </DashboardShell>
  );
}

function DashboardPanel() {
  const [stats, setStats] = useState<{
    totalConversations: number;
    activeConversations: number;
    waitingConversations: number;
    resolvedConversations: number;
    botConversations: number;
    totalCs: number;
    totalCustomers: number;
    todayMessages: number;
    avgRating: number;
    recentReviews: {
      id: string;
      customer_name: string | null;
      wa_number: string;
      rating: number | null;
      review: string | null;
      resolved_at: string;
    }[];
    conversationsByStatus: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/admin/dashboard-stats")
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-sm text-slate-500 animate-pulse">Memuat...</div>
    );
  }

  if (!stats) {
    return (
      <div className="text-sm text-slate-500">Gagal memuat data dashboard</div>
    );
  }

  const statCards = [
    {
      label: "Total Percakapan",
      value: stats.totalConversations,
      icon: MessageSquare,
      color: "text-blue-400",
      bg: "bg-blue-500/15",
    },
    {
      label: "Aktif",
      value: stats.activeConversations,
      icon: TrendingUp,
      color: "text-emerald-400",
      bg: "bg-emerald-500/15",
    },
    {
      label: "Waiting",
      value: stats.waitingConversations,
      icon: Clock,
      color: "text-amber-400",
      bg: "bg-amber-500/15",
    },
    {
      label: "Resolved",
      value: stats.resolvedConversations,
      icon: UserCheck,
      color: "text-slate-400",
      bg: "bg-slate-500/15",
    },
    {
      label: "CS Online",
      value: stats.totalCs,
      icon: Users,
      color: "text-purple-400",
      bg: "bg-purple-500/15",
    },
    {
      label: "Total Customer",
      value: stats.totalCustomers,
      icon: UserCheck,
      color: "text-teal-400",
      bg: "bg-teal-500/15",
    },
    {
      label: "Pesan Hari Ini",
      value: stats.todayMessages,
      icon: MessageSquare,
      color: "text-cyan-400",
      bg: "bg-cyan-500/15",
    },
    {
      label: "Rata-rata Rating",
      value: stats.avgRating ? stats.avgRating.toFixed(1) : "-",
      icon: Star,
      color: "text-yellow-400",
      bg: "bg-yellow-500/15",
    },
  ];

  const total = stats.totalConversations || 1;
  const statusBars = [
    { label: "Bot", count: stats.botConversations, color: "bg-blue-500" },
    { label: "Waiting", count: stats.waitingConversations, color: "bg-amber-500" },
    { label: "Active", count: stats.activeConversations, color: "bg-emerald-500" },
    { label: "Resolved", count: stats.resolvedConversations, color: "bg-slate-500" },
  ];

  return (
    <div className="max-w-5xl space-y-6 animate-fadeIn">
      <h2 className="text-lg font-semibold text-slate-100">Dashboard</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-800 bg-slate-900 p-4"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={"rounded-lg p-2 " + card.bg}>
                <card.icon size={18} className={card.color} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-100">{card.value}</p>
            <p className="text-xs text-slate-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="text-sm font-medium text-slate-200 mb-4">
          Distribusi Percakapan
        </h3>
        <div className="space-y-3">
          {statusBars.map((bar) => (
            <div key={bar.label} className="flex items-center gap-3">
              <span className="text-xs text-slate-400 w-16">{bar.label}</span>
              <div className="flex-1 h-3 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={"h-full rounded-full transition-all " + bar.color}
                  style={{
                    width: Math.max(
                      2,
                      (bar.count / total) * 100
                    ) + "%",
                  }}
                />
              </div>
              <span className="text-xs text-slate-400 w-8 text-right">
                {bar.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="text-sm font-medium text-slate-200 mb-4">
          Review Terbaru
        </h3>
        {stats.recentReviews.length === 0 ? (
          <p className="text-xs text-slate-500">Belum ada review</p>
        ) : (
          <div className="space-y-3">
            {stats.recentReviews.map((review) => (
              <div
                key={review.id}
                className="rounded-lg border border-slate-800 bg-slate-950 p-3"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-200">
                    {review.customer_name || review.wa_number}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={12}
                        className={
                          star <= (review.rating || 0)
                            ? "text-yellow-400 fill-yellow-400"
                            : "text-slate-600"
                        }
                      />
                    ))}
                  </div>
                </div>
                {review.review && (
                  <p className="text-xs text-slate-400">{review.review}</p>
                )}
                <p className="text-[10px] text-slate-600 mt-1">
                  {new Date(review.resolved_at).toLocaleString("id-ID")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BotConfigPanel() {
  const [form, setForm] = useState({
    persona_name: "",
    system_prompt: "",
    business_info: "",
    escalation_keywords: "",
    session_timeout_mins: 30,
    auto_close_enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", type: "info" });

  useEffect(() => {
    apiFetch("/api/admin/bot-config")
      .then((res) => res.json())
      .then((data) => {
        const config = data.config || data;
        setForm({
          persona_name: config.persona_name || "",
          system_prompt: config.system_prompt || "",
          business_info: config.business_info || "",
          escalation_keywords: config.escalation_keywords || "",
          session_timeout_mins: config.session_timeout_mins ?? 30,
          auto_close_enabled: config.auto_close_enabled ?? false,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/bot-config", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      setModal({
        isOpen: true,
        title: "Berhasil",
        message: "Konfigurasi bot berhasil disimpan",
        type: "success",
      });
    } catch {
      setModal({
        isOpen: true,
        title: "Error",
        message: "Gagal menyimpan konfigurasi bot",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-slate-500 animate-pulse">Memuat...</div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6 animate-fadeIn">
      <h2 className="text-lg font-semibold text-slate-100">Konfigurasi Bot</h2>

      <div>
        <label className="block text-xs text-slate-400 mb-1.5">
          Nama Persona / Soul
        </label>
        <input
          type="text"
          value={form.persona_name}
          onChange={(e) => setForm((f) => ({ ...f, persona_name: e.target.value }))}
          placeholder="Contoh: Aini, CS Bot Ramah"
          className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600 transition-colors"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1.5">
          System Prompt
        </label>
        <textarea
          value={form.system_prompt}
          onChange={(e) =>
            setForm((f) => ({ ...f, system_prompt: e.target.value }))
          }
          rows={6}
          placeholder="Instruksi utama untuk bot AI..."
          className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600 resize-none transition-colors"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1.5">
          Informasi Bisnis
        </label>
        <textarea
          value={form.business_info}
          onChange={(e) =>
            setForm((f) => ({ ...f, business_info: e.target.value }))
          }
          rows={4}
          placeholder="Jam operasional, alamat, kebijakan, FAQ..."
          className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600 resize-none transition-colors"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1.5">
          Kata Kunci Eskalasi
        </label>
        <input
          type="text"
          value={form.escalation_keywords}
          onChange={(e) =>
            setForm((f) => ({ ...f, escalation_keywords: e.target.value }))
          }
          placeholder="Contoh: bicara admin, CS, supervisor (pisahkan dengan koma)"
          className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600 transition-colors"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1.5">
          Session Timeout (menit)
        </label>
        <input
          type="number"
          value={form.session_timeout_mins}
          onChange={(e) =>
            setForm((f) => ({ ...f, session_timeout_mins: parseInt(e.target.value) || 30 }))
          }
          min={1}
          max={1440}
          className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600 transition-colors"
        />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400">Auto Close</span>
        <button
          type="button"
          onClick={() =>
            setForm((f) => ({ ...f, auto_close_enabled: !f.auto_close_enabled }))
          }
          className={
            "relative w-10 h-6 rounded-full transition-colors " +
            (form.auto_close_enabled ? "bg-emerald-500" : "bg-slate-700")
          }
        >
          <span
            className={
              "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform " +
              (form.auto_close_enabled ? "translate-x-4" : "translate-x-0")
            }
          />
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
      >
        <Save size={16} />
        {saving ? "Menyimpan..." : "Simpan"}
      </button>

      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal((m) => ({ ...m, isOpen: false }))}
        title={modal.title}
        message={modal.message}
        type={modal.type}
      />
    </div>
  );
}

function StockConfigPanel() {
  const [sourceType, setSourceType] = useState<"google_sheets" | "mysql" | "postgresql">(
    "google_sheets"
  );
  const [configJson, setConfigJson] = useState("{}");
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Record<string, string>[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [jsonError, setJsonError] = useState("");
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", type: "info" });

  useEffect(() => {
    apiFetch("/api/admin/stock-config")
      .then((res) => res.json())
      .then((data) => {
        const config = data.config || data;
        setSourceType(config.source_type || "google_sheets");
        setIsActive(config.is_active ?? false);
        // Handle config_json: may be string or object
        const cj = config.config_json;
        if (typeof cj === "string") {
          try {
            setConfigJson(JSON.stringify(JSON.parse(cj), null, 2));
          } catch {
            setConfigJson(cj);
          }
        } else {
          setConfigJson(JSON.stringify(cj || {}, null, 2));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(configJson);
    } catch {
      setJsonError("JSON tidak valid. Periksa kembali formatnya.");
      return;
    }
    setJsonError("");

    setSaving(true);
    try {
      const res = await apiFetch("/api/admin/stock-config", {
        method: "PUT",
        body: JSON.stringify({ source_type: sourceType, config_json: parsed, is_active: isActive }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      setModal({
        isOpen: true,
        title: "Berhasil",
        message: "Konfigurasi stok berhasil disimpan",
        type: "success",
      });
    } catch {
      setModal({
        isOpen: true,
        title: "Error",
        message: "Gagal menyimpan konfigurasi stok",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await apiFetch("/api/admin/stock/preview");
      const json = await res.json();
      const rows = Array.isArray(json)
        ? json
        : (json.rows || json.data || json.preview || []);
      setPreview(rows);
    } catch {
      setModal({
        isOpen: true,
        title: "Error",
        message: "Gagal memuat preview stok",
        type: "error",
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-sm text-slate-500 animate-pulse">Memuat...</div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 animate-fadeIn">
      <h2 className="text-lg font-semibold text-slate-100">Konfigurasi Stok</h2>

      <div>
        <label className="block text-xs text-slate-400 mb-1.5">
          Source Type
        </label>
        <select
          value={sourceType}
          onChange={(e) =>
            setSourceType(e.target.value as typeof sourceType)
          }
          className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-slate-600 transition-colors"
        >
          <option value="google_sheets">Google Sheets</option>
          <option value="mysql">MySQL</option>
          <option value="postgresql">PostgreSQL</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1.5">
          Config JSON
        </label>
        {sourceType === "google_sheets" && (
          <div className="mb-2 text-[10px] text-slate-500 space-y-0.5">
            <p>Format: {`{ "spreadsheet_id": "...", "sheet_name": "Sheet1", "header_row": 1, "columns": { "name": "A", "price": "B", "stock": "C" }, "credentials_path": "credentials/service-account.json" }`}</p>
            <p>Simpan file service-account.json di folder <code className="text-slate-400">backend/credentials/</code></p>
          </div>
        )}
        {(sourceType === "mysql" || sourceType === "postgresql") && (
          <div className="mb-2 text-[10px] text-slate-500 space-y-0.5">
            <p>Format: {`{ "host": "...", "port": ${sourceType === "mysql" ? "3306" : "5432"}, "database": "...", "user": "...", "password": "...", "table": "products", "col_name": "nama_produk", "col_qty": "stok", "col_price": "harga" }`}</p>
            <p>Gunakan user database <span className="text-amber-400">read-only</span> untuk keamanan.</p>
          </div>
        )}
        <textarea
          value={configJson}
          onChange={(e) => {
            setConfigJson(e.target.value);
            setJsonError("");
          }}
          rows={12}
          className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600 resize-none transition-colors"
        />
        {jsonError && (
          <p className="text-xs text-red-400 mt-1">{jsonError}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400">Aktifkan Sync Stok</span>
        <button
          type="button"
          onClick={() => setIsActive(!isActive)}
          className={
            "relative w-10 h-6 rounded-full transition-colors " +
            (isActive ? "bg-emerald-500" : "bg-slate-700")
          }
        >
          <span
            className={
              "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform " +
              (isActive ? "translate-x-4" : "translate-x-0")
            }
          />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? "Menyimpan..." : "Simpan"}
        </button>

        <button
          onClick={handlePreview}
          disabled={previewLoading}
          className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          <Eye size={16} />
          {previewLoading ? "Memuat..." : "Preview"}
        </button>
      </div>

      {preview && preview.length > 0 && (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900">
                  {Object.keys(preview[0]).map((key) => (
                    <th
                      key={key}
                      className="px-3 py-2 text-left font-medium text-slate-400"
                    >
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-slate-800/50 hover:bg-slate-900/50"
                  >
                    {Object.values(row).map((val, j) => (
                      <td
                        key={j}
                        className="px-3 py-2 text-slate-300"
                      >
                        {String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {preview && preview.length === 0 && (
        <p className="text-xs text-slate-500">Tidak ada data stok</p>
      )}

      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal((m) => ({ ...m, isOpen: false }))}
        title={modal.title}
        message={modal.message}
        type={modal.type}
      />
    </div>
  );
}

interface User {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "cs";
  is_active: boolean;
  created_at: string;
}

function UserPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "cs" as User["role"],
  });
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    role: "cs" as User["role"],
    is_active: true,
    password: "",
  });
  const [editLoading, setEditLoading] = useState(false);
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", type: "info" });

  const fetchUsers = () => {
    setLoading(true);
    apiFetch("/api/admin/users")
      .then((res) => res.json())
      .then((data) => {
        setUsers(data.users || data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(createForm),
      });
      if (!res.ok) throw new Error("Gagal membuat user");
      setModal({
        isOpen: true,
        title: "Berhasil",
        message: "User berhasil dibuat",
        type: "success",
      });
      setShowCreate(false);
      setCreateForm({ name: "", email: "", password: "", role: "cs" });
      fetchUsers();
    } catch {
      setModal({
        isOpen: true,
        title: "Error",
        message: "Gagal membuat user",
        type: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch("/api/admin/users/" + deleteTarget.id, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Gagal menghapus user");
      setModal({
        isOpen: true,
        title: "Berhasil",
        message: "User berhasil dihapus",
        type: "success",
      });
      fetchUsers();
    } catch {
      setModal({
        isOpen: true,
        title: "Error",
        message: "Gagal menghapus user",
        type: "error",
      });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleToggleActive = async (u: User) => {
    try {
      const res = await apiFetch("/api/admin/users/" + u.id, {
        method: "PUT",
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      if (!res.ok) throw new Error("Gagal mengubah status");
      fetchUsers();
    } catch {
      setModal({
        isOpen: true,
        title: "Error",
        message: "Gagal mengubah status user",
        type: "error",
      });
    }
  };

  const openEdit = (u: User) => {
    setEditTarget(u);
    setEditForm({
      name: u.name,
      email: u.email,
      role: u.role,
      is_active: u.is_active,
      password: "",
    });
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    setEditLoading(true);
    try {
      const body: Record<string, unknown> = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        is_active: editForm.is_active,
      };
      if (editForm.password) body.password = editForm.password;
      const res = await apiFetch("/api/admin/users/" + editTarget.id, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Gagal mengupdate user");
      setModal({
        isOpen: true,
        title: "Berhasil",
        message: "User berhasil diupdate",
        type: "success",
      });
      setEditTarget(null);
      fetchUsers();
    } catch {
      setModal({
        isOpen: true,
        title: "Error",
        message: "Gagal mengupdate user",
        type: "error",
      });
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">Manajemen User</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <UserPlus size={16} />
          Tambah User
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Nama</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, name: e.target.value }))
                }
                required
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, email: e.target.value }))
                }
                required
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Password (min. 6 karakter)
              </label>
              <input
                type="password"
                value={createForm.password}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, password: e.target.value }))
                }
                required
                minLength={6}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Role</label>
              <select
                value={createForm.role}
                onChange={(e) =>
                  setCreateForm((f) => ({
                    ...f,
                    role: e.target.value as User["role"],
                  }))
                }
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-600"
              >
                <option value="cs">CS</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
            >
              {creating ? "Membuat..." : "Simpan"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 animate-pulse">Memuat...</div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900">
                <th className="px-4 py-3 text-left font-medium text-slate-400">
                  Nama
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">
                  Email
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">
                  Role
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-medium text-slate-400">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Belum ada user
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-slate-800/50 hover:bg-slate-900/50"
                >
                  <td className="px-4 py-3 font-medium text-slate-200">
                    {u.name}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "text-xs px-2 py-0.5 rounded-full font-medium " +
                        (u.role === "super_admin"
                          ? "bg-purple-500/15 text-purple-400"
                          : u.role === "admin"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-emerald-500/15 text-emerald-400")
                      }
                    >
                      {u.role === "super_admin"
                        ? "Super Admin"
                        : u.role === "admin"
                        ? "Admin"
                        : "CS"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "text-xs " +
                        (u.is_active ? "text-emerald-400" : "text-slate-500")
                      }
                    >
                      {u.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleToggleActive(u)}
                        title={u.is_active ? "Nonaktifkan" : "Aktifkan"}
                        className={
                          "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors " +
                          (u.is_active
                            ? "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
                            : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25")
                        }
                      >
                        {u.is_active ? (
                          <ToggleRight size={12} />
                        ) : (
                          <ToggleLeft size={12} />
                        )}
                      </button>
                      <button
                        onClick={() => openEdit(u)}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-500/15 px-2 py-1 text-xs font-medium text-blue-400 hover:bg-blue-500/25 transition-colors"
                      >
                        <Pencil size={12} />
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(u)}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-500/15 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/25 transition-colors"
                      >
                        <Trash2 size={12} />
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        type="warning"
        isConfirm
        title="Hapus User"
        message={
          "Anda yakin ingin menghapus user \"" +
          (deleteTarget?.name || "") +
          "\"? Tindakan ini tidak dapat dibatalkan."
        }
        confirmText="Hapus"
        cancelText="Batal"
        onConfirm={handleDelete}
      />

      <Modal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="Edit User"
      >
        <div className="space-y-3 mt-2">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nama</label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Email</label>
            <input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Role</label>
            <select
              value={editForm.role}
              onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as User["role"] }))}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-600"
            >
              <option value="cs">CS</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">Aktif</span>
            <button
              type="button"
              onClick={() => setEditForm((f) => ({ ...f, is_active: !f.is_active }))}
              className={
                "relative w-10 h-6 rounded-full transition-colors " +
                (editForm.is_active ? "bg-emerald-500" : "bg-slate-700")
              }
            >
              <span
                className={
                  "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform " +
                  (editForm.is_active ? "translate-x-4" : "translate-x-0")
                }
              />
            </button>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Password Baru (kosongkan jika tidak diubah)
            </label>
            <input
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Minimal 6 karakter"
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600"
            />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setEditTarget(null)}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800 transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleEdit}
              disabled={editLoading}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
            >
              {editLoading ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal((m) => ({ ...m, isOpen: false }))}
        title={modal.title}
        message={modal.message}
        type={modal.type}
      />
    </div>
  );
}

function GatewayPanel() {
  const [status, setStatus] = useState<"connected" | "disconnected" | "loading">(
    "loading"
  );
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", type: "info" });

  useEffect(() => {
    const fetchStatus = () => {
      apiFetch("/api/gateway/status")
        .then((res) => res.json())
        .then((data) => {
          setStatus(data.status === "connected" ? "connected" : "disconnected");
          if (data.status !== "connected") {
            apiFetch("/api/gateway/qr")
              .then((res) => res.json())
              .then((qr) => setQrCode(qr.qr_code || qr.qr || null))
              .catch(() => {});
          } else {
            setQrCode(null);
          }
        })
        .catch(() => setStatus("disconnected"));
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);

    const socket = getIO();
    socket?.on("gateway:status", (data: { status: string }) => {
      setStatus(data.status === "connected" ? "connected" : "disconnected");
    });

    return () => {
      clearInterval(interval);
      socket?.off("gateway:status");
    };
  }, []);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await apiFetch("/api/gateway/disconnect", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Disconnect failed");
      setModal({
        isOpen: true,
        title: "Berhasil",
        message: "Gateway WA telah diputuskan",
        type: "success",
      });
    } catch {
      setModal({
        isOpen: true,
        title: "Error",
        message: "Gagal memutuskan gateway",
        type: "error",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await apiFetch("/api/gateway/connect", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Connect failed");
      setModal({
        isOpen: true,
        title: "Berhasil",
        message: "Gateway WA sedang menghubungkan",
        type: "success",
      });
    } catch {
      setModal({
        isOpen: true,
        title: "Error",
        message: "Gagal menghubungkan gateway",
        type: "error",
      });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="max-w-lg space-y-6 animate-fadeIn">
      <h2 className="text-lg font-semibold text-slate-100">
        Status WhatsApp Gateway
      </h2>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div
            className={
              "w-3 h-3 rounded-full " +
              (status === "connected"
                ? "bg-emerald-500 animate-pulse"
                : status === "disconnected"
                ? "bg-red-500"
                : "bg-amber-500 animate-pulse")
            }
          />
          <span className="text-sm font-medium text-slate-200">
            {status === "connected"
              ? "Terhubung"
              : status === "disconnected"
              ? "Terputus"
              : "Memeriksa..."}
          </span>
          {status === "disconnected" && (
            <button
              onClick={() => {
                apiFetch("/api/gateway/qr")
                  .then((r) => r.json())
                  .then((d) => setQrCode(d.qr_code || d.qr || null))
                  .catch(() => {});
              }}
              className="ml-auto flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 transition-colors"
            >
              <RefreshCw size={12} />
              Refresh QR
            </button>
          )}
        </div>

        {qrCode && status === "disconnected" && (
          <div className="flex flex-col items-center gap-3 mb-4">
            <p className="text-xs text-slate-400">
              Scan QR code ini dengan WhatsApp
            </p>
            <div className="rounded-xl bg-white p-3">
              <img
                src={qrCode.startsWith("data:") ? qrCode : "data:image/png;base64," + qrCode}
                alt="QR Code"
                className="w-48 h-48"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={handleConnect}
            disabled={connecting || status === "connected"}
            className="flex items-center gap-2 rounded-lg bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Link2 size={16} />
            {connecting ? "Menghubungkan..." : "Connect"}
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting || status !== "connected"}
            className="flex items-center gap-2 rounded-lg bg-red-500/15 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Power size={16} />
            {disconnecting ? "Memutuskan..." : "Disconnect"}
          </button>
        </div>
      </div>

      <Modal
        isOpen={modal.isOpen}
        onClose={() => setModal((m) => ({ ...m, isOpen: false }))}
        title={modal.title}
        message={modal.message}
        type={modal.type}
      />
    </div>
  );
}

function AuditPanel() {
  const [logs, setLogs] = useState<
    {
      id: string;
      user_name?: string;
      action: string;
      details?: string;
      created_at: string;
    }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/admin/audit-log")
      .then((res) => res.json())
      .then((data) => {
        setLogs(Array.isArray(data) ? data : Array.isArray(data?.logs) ? data.logs : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4 animate-fadeIn">
      <h2 className="text-lg font-semibold text-slate-100">Audit Log</h2>

      {loading ? (
        <div className="text-sm text-slate-500 animate-pulse">Memuat...</div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900">
                <th className="px-4 py-3 text-left font-medium text-slate-400">
                  Waktu
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">
                  User
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">
                  Aksi
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Belum ada log
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-slate-800/50 hover:bg-slate-900/50"
                >
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                    {new Date(log.created_at).toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {log.user_name || "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{log.action}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">
                    {log.details || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
