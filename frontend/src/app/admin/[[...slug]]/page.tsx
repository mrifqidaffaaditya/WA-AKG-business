"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
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
  Activity,
  Zap,
  MessageCircle,
  ArrowUpRight,
} from "lucide-react";

type TabType = "dashboard" | "bot" | "stock" | "users" | "gateway" | "audit" | "cs_config";

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-5 h-5 rounded-full border-2 border-slate-600 border-t-emerald-500 animate-spin" />
            <span className="text-sm">Memuat...</span>
          </div>
        </div>
      }
    >
      <AdminContent params={useParams() as { slug?: string[] }} />
    </Suspense>
  );
}

function AdminContent({ params }: { params: { slug?: string[] } }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Build verification marker — check this in browser console
  // console.log("[ADMIN-PAGE-v3]", { userIsNull: user === null, authLoading, slug: params.slug });

  const slug = params.slug?.[0] || "dashboard";
  const VALID_TABS: TabType[] = ["dashboard", "bot", "stock", "users", "gateway", "audit", "cs_config"];
  const activeTab: TabType = VALID_TABS.includes(slug as TabType) ? (slug as TabType) : "dashboard";

  useEffect(() => {
    if (user && user.role === "cs") {
      router.replace("/cs");
    }
  }, [user, router]);

  useEffect(() => {
    if (!authLoading && !user) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem("return_to", window.location.pathname);
      }
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user && user.role !== "cs") {
      setupPushNotifications();
      connect();
    }
  }, [user]);

  // Safety: never render anything below this point if user is null or still loading
  if (!user || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-5 h-5 rounded-full border-2 border-slate-600 border-t-emerald-500 animate-spin" />
          <span className="text-sm">Memuat...</span>
        </div>
      </div>
    );
  }

  if (user.role === "cs") return null;

  return (
    <DashboardShell>
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6">
          {activeTab === "dashboard" && <DashboardPanel />}
          {activeTab === "bot" && <BotConfigPanel />}
          {activeTab === "stock" && <StockConfigPanel />}
          {activeTab === "users" && <UserPanel />}
          {activeTab === "gateway" && <GatewayPanel />}
          {activeTab === "audit" && <AuditPanel />}
          {activeTab === "cs_config" && <CSConfigPanel />}
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
    onlineCs: number;
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
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    apiFetch("/api/admin/dashboard-stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
        setLastUpdate(new Date());
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    const socket = getIO();
    if (!socket) return;
    const handler = (data: typeof stats) => {
      setStats(data);
      setLastUpdate(new Date());
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    };
    socket.on("dashboard:stats", handler);

    return () => {
      socket.off("dashboard:stats", handler);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-emerald-500 animate-spin" />
          <span className="text-sm">Memuat data...</span>
        </div>
      </div>
    );
  }
  if (!stats || (stats as any).error || !stats.recentReviews) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <p>Gagal memuat statistik. Pastikan Anda memiliki akses admin.</p>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Percakapan",
      value: stats.totalConversations,
      icon: MessageSquare,
      gradient: "from-blue-500/10 to-blue-500/5",
      iconBg: "bg-blue-500/15",
      iconColor: "text-blue-400",
      border: "border-blue-500/10",
    },
    {
      label: "Aktif",
      value: stats.activeConversations,
      icon: Zap,
      gradient: "from-emerald-500/10 to-emerald-500/5",
      iconBg: "bg-emerald-500/15",
      iconColor: "text-emerald-400",
      border: "border-emerald-500/10",
    },
    {
      label: "Waiting",
      value: stats.waitingConversations,
      icon: Clock,
      gradient: "from-amber-500/10 to-amber-500/5",
      iconBg: "bg-amber-500/15",
      iconColor: "text-amber-400",
      border: "border-amber-500/10",
    },
    {
      label: "Resolved",
      value: stats.resolvedConversations,
      icon: UserCheck,
      gradient: "from-slate-500/10 to-slate-500/5",
      iconBg: "bg-slate-500/15",
      iconColor: "text-slate-400",
      border: "border-slate-700/50",
    },
    {
      label: "CS Aktif",
      value: stats.onlineCs,
      suffix: `/ ${stats.totalCs}`,
      icon: Users,
      gradient: "from-purple-500/10 to-purple-500/5",
      iconBg: "bg-purple-500/15",
      iconColor: "text-purple-400",
      border: "border-purple-500/10",
      pulse: stats.onlineCs > 0,
    },
    {
      label: "Total Customer",
      value: stats.totalCustomers,
      icon: TrendingUp,
      gradient: "from-teal-500/10 to-teal-500/5",
      iconBg: "bg-teal-500/15",
      iconColor: "text-teal-400",
      border: "border-teal-500/10",
    },
    {
      label: "Pesan Hari Ini",
      value: stats.todayMessages,
      icon: MessageCircle,
      gradient: "from-cyan-500/10 to-cyan-500/5",
      iconBg: "bg-cyan-500/15",
      iconColor: "text-cyan-400",
      border: "border-cyan-500/10",
    },
    {
      label: "Rata-rata Rating",
      value: stats.avgRating ? stats.avgRating.toFixed(1) : "-",
      icon: Star,
      gradient: "from-yellow-500/10 to-yellow-500/5",
      iconBg: "bg-yellow-500/15",
      iconColor: "text-yellow-400",
      border: "border-yellow-500/10",
    },
  ];

  const total = stats.totalConversations || 1;
  const statusBars = [
    { label: "Bot", count: stats.botConversations, color: "bg-blue-500", pct: ((stats.botConversations / total) * 100).toFixed(1) },
    { label: "Waiting", count: stats.waitingConversations, color: "bg-amber-500", pct: ((stats.waitingConversations / total) * 100).toFixed(1) },
    { label: "Active", count: stats.activeConversations, color: "bg-emerald-500", pct: ((stats.activeConversations / total) * 100).toFixed(1) },
    { label: "Resolved", count: stats.resolvedConversations, color: "bg-slate-500", pct: ((stats.resolvedConversations / total) * 100).toFixed(1) },
  ];

  return (
    <div className="max-w-6xl animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <LayoutDashboard size={16} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Dashboard</h2>
            <p className="text-xs text-slate-500">Ringkasan performa CS realtime</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-[10px] text-slate-600">
              Live · {lastUpdate.toLocaleTimeString("id-ID")}
            </span>
          )}
          <div className={`w-2 h-2 rounded-full transition-colors duration-300 ${pulse ? "bg-emerald-500 shadow-lg shadow-emerald-500/50" : "bg-slate-700"}`} />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={
              "group relative rounded-xl border bg-gradient-to-b " +
              card.gradient + " " + card.border +
              " p-4 hover:border-slate-600/50 transition-all duration-200 cursor-pointer"
            }
          >
            <div className="flex items-start justify-between mb-3">
              <div className={"rounded-lg p-2 relative " + card.iconBg}>
                <card.icon size={17} className={card.iconColor} />
                {"pulse" in card && card.pulse && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border-2 border-slate-950 animate-pulse" />
                )}
              </div>
              <ArrowUpRight
                size={14}
                className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
            <p className="text-[28px] font-bold text-slate-100 leading-none tracking-tight tabular-nums">
              {card.value}
              {"suffix" in card && card.suffix && (
                <span className="text-sm font-normal text-slate-600 ml-1">{card.suffix}</span>
              )}
            </p>
            <p className="text-[11px] text-slate-500 mt-1.5 font-medium tracking-wide uppercase">
              {card.label}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-slate-200">
              Distribusi Percakapan
            </h3>
            <span className="text-[10px] text-slate-500">
              Total {stats.totalConversations}
            </span>
          </div>
          <div className="space-y-4">
            {statusBars.map((bar) => (
              <div key={bar.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className={"w-2.5 h-2.5 rounded-sm " + bar.color} />
                    <span className="text-xs text-slate-400 font-medium">
                      {bar.label}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {bar.count} <span className="text-slate-600">({bar.pct}%)</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={"h-full rounded-full transition-all duration-700 ease-out " + bar.color}
                    style={{ width: Math.max(2, (bar.count / total) * 100) + "%" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200">
              Review Terbaru
            </h3>
            {stats.recentReviews.length > 0 && (
              <span className="text-[10px] text-slate-500">
                {stats.recentReviews.length} review
              </span>
            )}
          </div>
          {stats.recentReviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Star size={24} className="text-slate-700 mb-2" />
              <p className="text-xs text-slate-500">Belum ada review</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.recentReviews.slice(0, 6).map((review) => (
                <div
                  key={review.id}
                  className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-3 hover:border-slate-700/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-slate-300 truncate max-w-[120px]">
                      {review.customer_name || review.wa_number}
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={10}
                          className={
                            star <= (review.rating || 0)
                              ? "text-yellow-400 fill-yellow-400"
                              : "text-slate-700"
                          }
                        />
                      ))}
                    </div>
                  </div>
                  {review.review ? (
                    <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                      {review.review}
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-600 italic">Tanpa komentar</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CSPerformanceTable />

    </div>
  );
}

function CSPerformanceTable() {
  const [csStats, setCsStats] = useState<{
    id: string;
    name: string;
    role: string;
    is_online: boolean;
    total_claimed: number;
    total_resolved: number;
    avg_rating: number | null;
    active_count: number;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/admin/cs-stats")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setCsStats(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (csStats.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-200">
          Performa Customer Service
        </h3>
        <span className="text-[10px] text-slate-500">
          {csStats.length} CS
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">CS</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Role</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Claimed</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Resolved</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Aktif</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Rating</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {csStats.map((cs) => (
              <tr key={cs.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-3 py-3 text-slate-200 font-medium text-xs">{cs.name}</td>
                <td className="px-3 py-3 text-center">
                  <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                    cs.role === "admin" ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"
                  }`}>
                    {cs.role === "admin" ? "Admin" : "CS"}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    cs.is_online ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-700/50 text-slate-500"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cs.is_online ? "bg-emerald-400" : "bg-slate-600"}`} />
                    {cs.is_online ? "Online" : "Offline"}
                  </span>
                </td>
                <td className="px-3 py-3 text-center text-xs text-slate-300 font-mono">{cs.total_claimed}</td>
                <td className="px-3 py-3 text-center text-xs text-slate-300 font-mono">{cs.total_resolved}</td>
                <td className="px-3 py-3 text-center text-xs text-slate-300 font-mono">{cs.active_count}</td>
                <td className="px-3 py-3 text-center text-xs">
                  {cs.avg_rating != null ? (
                    <span className="font-medium text-yellow-400">{cs.avg_rating}</span>
                  ) : (
                    <span className="text-slate-600">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BotConfigPanel() {
  const [form, setForm] = useState<{
    persona_name: string;
    system_prompt: string;
    business_info: string;
    escalation_keywords: string;
    session_timeout_mins: number | "";
    session_timeout_warning_mins: number | "";
    auto_close_enabled: boolean;
  }>({
    persona_name: "",
    system_prompt: "",
    business_info: "",
    escalation_keywords: "",
    session_timeout_mins: 30,
    session_timeout_warning_mins: 5,
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
          session_timeout_warning_mins: config.session_timeout_warning_mins ?? 5,
          auto_close_enabled: config.auto_close_enabled ?? false,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const timeoutVal = typeof form.session_timeout_mins === "number" && form.session_timeout_mins >= 1
        ? form.session_timeout_mins
        : 30;

      const warningVal = typeof form.session_timeout_warning_mins === "number" && form.session_timeout_warning_mins >= 0
        ? form.session_timeout_warning_mins
        : 5;

      const payload = {
        ...form,
        session_timeout_mins: timeoutVal,
        session_timeout_warning_mins: warningVal,
      };

      const res = await apiFetch("/api/admin/bot-config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Gagal menyimpan");
      }
      
      setForm((f) => ({ ...f, session_timeout_mins: timeoutVal, session_timeout_warning_mins: warningVal }));

      setModal({
        isOpen: true,
        title: "Berhasil",
        message: "Konfigurasi bot berhasil disimpan",
        type: "success",
      });
    } catch (err: any) {
      setModal({
        isOpen: true,
        title: "Error",
        message: err.message || "Gagal menyimpan konfigurasi bot",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-emerald-500 animate-spin" />
          <span className="text-sm">Memuat...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl animate-fadeIn">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <Bot size={16} className="text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Konfigurasi Bot</h2>
          <p className="text-xs text-slate-500">Persona AI dan pengaturan otomatisasi</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-5">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Nama Persona / Soul
          </label>
          <input
            type="text"
            value={form.persona_name}
            onChange={(e) => setForm((f) => ({ ...f, persona_name: e.target.value }))}
            placeholder="Contoh: Aini, CS Bot Ramah"
            className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            System Prompt
          </label>
          <textarea
            value={form.system_prompt}
            onChange={(e) => setForm((f) => ({ ...f, system_prompt: e.target.value }))}
            rows={6}
            placeholder="Instruksi utama untuk bot AI..."
            className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 resize-none transition-all font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Informasi Bisnis
          </label>
          <textarea
            value={form.business_info}
            onChange={(e) => setForm((f) => ({ ...f, business_info: e.target.value }))}
            rows={4}
            placeholder="Jam operasional, alamat, kebijakan, FAQ..."
            className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 resize-none transition-all"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Kata Kunci Eskalasi (pisahkan dengan koma)
          </label>
          <input
            type="text"
            value={form.escalation_keywords}
            onChange={(e) => setForm((f) => ({ ...f, escalation_keywords: e.target.value }))}
            placeholder="bicara admin, CS, supervisor"
            className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Session Timeout (menit)
            </label>
            <input
              type="number"
              value={form.session_timeout_mins}
              onChange={(e) => {
                const val = e.target.value;
                setForm((f) => ({
                  ...f,
                  session_timeout_mins: val === "" ? "" : parseInt(val) || 0,
                }));
              }}
              min={1}
              max={1440}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Peringatan Timeout (menit sebelum close)
            </label>
            <input
              type="number"
              value={form.session_timeout_warning_mins}
              onChange={(e) => {
                const val = e.target.value;
                setForm((f) => ({
                  ...f,
                  session_timeout_warning_mins: val === "" ? "" : parseInt(val) || 0,
                }));
              }}
              min={0}
              max={1440}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
            />
          </div>
          <div className="flex flex-col justify-end pb-1 col-span-2 sm:col-span-1">
            <label className="text-xs font-medium text-slate-400 mb-2 block">
              Auto Close
            </label>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, auto_close_enabled: !f.auto_close_enabled }))}
              className={
                "relative w-11 h-6 rounded-full transition-colors " +
                (form.auto_close_enabled ? "bg-emerald-500" : "bg-slate-700")
              }
            >
              <span
                className={
                  "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform " +
                  (form.auto_close_enabled ? "translate-x-5" : "translate-x-0")
                }
              />
            </button>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
        >
          <Save size={15} />
          {saving ? "Menyimpan..." : "Simpan Konfigurasi"}
        </button>
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

function StockConfigPanel() {
  const [sourceType, setSourceType] = useState<"google_sheets" | "mysql" | "postgresql">("google_sheets");
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
      const rows = Array.isArray(json) ? json : (json.rows || json.data || json.preview || []);
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
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-emerald-500 animate-spin" />
          <span className="text-sm">Memuat...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl animate-fadeIn">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <Package size={16} className="text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Konfigurasi Stok</h2>
          <p className="text-xs text-slate-500">Sumber data dan sinkronisasi stok</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-5">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Source Type
          </label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value as typeof sourceType)}
            className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
          >
            <option value="google_sheets">Google Sheets</option>
            <option value="mysql">MySQL</option>
            <option value="postgresql">PostgreSQL</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Config JSON
          </label>
          {sourceType === "google_sheets" && (
            <div className="mb-2 text-[10px] text-slate-500 space-y-0.5 bg-slate-950/50 rounded-lg p-2.5 border border-slate-800/50">
              <p>Format: {`{ "spreadsheet_id": "...", "sheet_name": "Sheet1", "header_row": 1, "columns": { "name": "A", "price": "B", "stock": "C" }, "credentials_path": "credentials/service-account.json" }`}</p>
              <p className="text-slate-600 mt-1">Simpan file service-account.json di folder backend/credentials/</p>
            </div>
          )}
          {(sourceType === "mysql" || sourceType === "postgresql") && (
            <div className="mb-2 text-[10px] text-slate-500 space-y-0.5 bg-slate-950/50 rounded-lg p-2.5 border border-slate-800/50">
              <p>Format: {`{ "host": "...", "port": ${sourceType === "mysql" ? "3306" : "5432"}, "database": "...", "user": "...", "password": "...", "table": "products", "col_name": "nama_produk", "col_qty": "stok", "col_price": "harga" }`}</p>
              <p className="mt-1">Gunakan user database <span className="text-amber-400">read-only</span> untuk keamanan.</p>
            </div>
          )}
          <textarea
            value={configJson}
            onChange={(e) => {
              setConfigJson(e.target.value);
              setJsonError("");
            }}
            rows={12}
            className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 resize-none transition-all"
          />
          {jsonError && (
            <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-red-400" />
              {jsonError}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-slate-400">Aktifkan Sync Stok</label>
          <button
            type="button"
            onClick={() => setIsActive(!isActive)}
            className={
              "relative w-11 h-6 rounded-full transition-colors " +
              (isActive ? "bg-emerald-500" : "bg-slate-700")
            }
          >
            <span
              className={
                "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform " +
                (isActive ? "translate-x-5" : "translate-x-0")
              }
            />
          </button>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            <Save size={15} />
            {saving ? "Menyimpan..." : "Simpan"}
          </button>

          <button
            onClick={handlePreview}
            disabled={previewLoading}
            className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <Eye size={15} />
            {previewLoading ? "Memuat..." : "Preview"}
          </button>
        </div>

        {preview && preview.length > 0 && (
          <div className="rounded-lg border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950">
                    {Object.keys(preview[0]).map((key) => (
                      <th key={key} className="px-3 py-2.5 text-left font-medium text-slate-400">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-950/50 transition-colors">
                      {Object.values(row).map((val, j) => (
                        <td key={j} className="px-3 py-2.5 text-slate-300">
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
          <p className="text-xs text-slate-500 text-center py-4">Tidak ada data stok</p>
        )}
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

interface User {
  id: string;
  name: string;
  email: string;
  role: "super_admin" | "admin" | "cs";
  is_active: boolean;
  is_online?: boolean;
  created_at: string;
}

function UserPanel() {
  const { user } = useAuth();
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
        setUsers((data.users || data || []).filter(Boolean));
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
      setModal({ isOpen: true, title: "Berhasil", message: "User berhasil dibuat", type: "success" });
      setShowCreate(false);
      setCreateForm({ name: "", email: "", password: "", role: "cs" });
      fetchUsers();
    } catch {
      setModal({ isOpen: true, title: "Error", message: "Gagal membuat user", type: "error" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await apiFetch("/api/admin/users/" + deleteTarget.id, { method: "DELETE" });
      if (!res.ok) throw new Error("Gagal menghapus user");
      setModal({ isOpen: true, title: "Berhasil", message: "User berhasil dihapus", type: "success" });
      fetchUsers();
    } catch {
      setModal({ isOpen: true, title: "Error", message: "Gagal menghapus user", type: "error" });
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
      setModal({ isOpen: true, title: "Error", message: "Gagal mengubah status user", type: "error" });
    }
  };

  const openEdit = (u: User) => {
    setEditTarget(u);
    setEditForm({ name: u.name, email: u.email, role: u.role, is_active: u.is_active, password: "" });
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
      setModal({ isOpen: true, title: "Berhasil", message: "User berhasil diupdate", type: "success" });
      setEditTarget(null);
      fetchUsers();
    } catch {
      setModal({ isOpen: true, title: "Error", message: "Gagal mengupdate user", type: "error" });
    } finally {
      setEditLoading(false);
    }
  };

  const roleColors: Record<string, string> = {
    super_admin: "bg-purple-500/15 text-purple-400 border-purple-500/20",
    admin: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    cs: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  };

  const roleLabels: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    cs: "CS",
  };

  const ROLE_LEVEL: Record<string, number> = {
    super_admin: 3,
    admin: 2,
    cs: 1,
  };

  const actorRole = user ? user.role : "cs";
  const actorRoleLevel = ROLE_LEVEL[actorRole] || 0;
  const allowedRoles = Object.keys(ROLE_LEVEL).filter(
    (r) => (ROLE_LEVEL[r] || 0) < actorRoleLevel
  );

  function canModify(target: User | null | undefined): boolean {
    if (!target) return false;
    return (ROLE_LEVEL[target.role] || 0) < actorRoleLevel && target.id !== user?.id;
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Users size={16} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Manajemen User</h2>
            <p className="text-xs text-slate-500">{users.length} user terdaftar</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors"
        >
          <UserPlus size={15} />
          Tambah User
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-emerald-500/20 bg-slate-900 p-5 mb-4 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Nama</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                required
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                required
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Password (min. 6 karakter)</label>
              <input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                required
                minLength={6}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as User["role"] }))}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 transition-all"
              >
                {allowedRoles.map((r) => (
                  <option key={r} value={r}>{roleLabels[r] || r}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
            >
              {creating ? "Membuat..." : "Simpan"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-emerald-500 animate-spin" />
            <span className="text-sm">Memuat user...</span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50">
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Nama</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Koneksi</th>
                <th className="px-4 py-3.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Users size={24} className="text-slate-700" />
                      <p className="text-sm text-slate-500">Belum ada user</p>
                    </div>
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3.5">
                    <span className="font-medium text-slate-200">{u.name}</span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 text-xs">{u.email}</td>
                  <td className="px-4 py-3.5">
                    <span className={"text-[10px] px-2 py-0.5 rounded-full font-medium border " + (roleColors[u.role] || roleColors.cs)}>
                      {roleLabels[u.role] || "CS"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={"inline-flex items-center gap-1.5 text-xs " + (u.is_active ? "text-emerald-400" : "text-slate-500")}>
                      <span className={"w-1.5 h-1.5 rounded-full " + (u.is_active ? "bg-emerald-400" : "bg-slate-600")} />
                      {u.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={"inline-flex items-center gap-1.5 text-xs " + (u.is_online ? "text-emerald-400 font-medium" : "text-slate-500")}>
                      <span className={"w-1.5 h-1.5 rounded-full " + (u.is_online ? "bg-emerald-400 animate-pulse" : "bg-slate-600")} />
                      {u.is_online ? "Online" : "Offline"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleToggleActive(u)}
                        disabled={!canModify(u)}
                        title={
                          !canModify(u)
                            ? u.id === user?.id
                              ? "Tidak bisa mengubah status sendiri"
                              : "Tidak bisa mengubah user dengan role ini"
                            : u.is_active
                              ? "Nonaktifkan"
                              : "Aktifkan"
                        }
                        className={
                          "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors " +
                          (!canModify(u)
                            ? "opacity-30 cursor-not-allowed bg-slate-800 text-slate-600"
                            : u.is_active
                              ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20")
                        }
                      >
                        {u.is_active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                      </button>
                      <button
                        onClick={() => openEdit(u)}
                        disabled={!canModify(u)}
                        title={
                          !canModify(u)
                            ? u.id === user?.id
                              ? "Tidak bisa mengedit diri sendiri"
                              : "Tidak bisa mengedit user dengan role ini"
                            : "Edit"
                        }
                        className={
                          "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors " +
                          (!canModify(u)
                            ? "opacity-30 cursor-not-allowed bg-slate-800 text-slate-600"
                            : "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20")
                        }
                      >
                        <Pencil size={13} />
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(u)}
                        disabled={!canModify(u)}
                        title={
                          !canModify(u)
                            ? u.id === user?.id
                              ? "Tidak bisa menghapus diri sendiri"
                              : "Tidak bisa menghapus user dengan role ini"
                            : "Hapus"
                        }
                        className={
                          "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors " +
                          (!canModify(u)
                            ? "opacity-30 cursor-not-allowed bg-slate-800 text-slate-600"
                            : "bg-red-500/10 text-red-400 hover:bg-red-500/20")
                        }
                      >
                        <Trash2 size={13} />
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
        message={"Anda yakin ingin menghapus user \"" + (deleteTarget?.name || "") + "\"? Tindakan ini tidak dapat dibatalkan."}
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
            <label className="block text-xs font-medium text-slate-400 mb-1">Nama</label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Email</label>
            <input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Role</label>
            <select
              value={editForm.role}
              onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as User["role"] }))}
              disabled={!canModify(editTarget!)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 transition-all disabled:opacity-50"
            >
              {allowedRoles.map((r) => (
                <option key={r} value={r}>{roleLabels[r] || r}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-xs font-medium text-slate-400">Aktif</span>
            <button
              type="button"
              onClick={() => setEditForm((f) => ({ ...f, is_active: !f.is_active }))}
              className={
                "relative w-11 h-6 rounded-full transition-colors " +
                (editForm.is_active ? "bg-emerald-500" : "bg-slate-700")
              }
            >
              <span
                className={
                  "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform " +
                  (editForm.is_active ? "translate-x-5" : "translate-x-0")
                }
              />
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Password Baru (opsional)</label>
            <input
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Minimal 6 karakter"
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 transition-all"
            />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setEditTarget(null)}
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleEdit}
              disabled={editLoading}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
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
  const [status, setStatus] = useState<"connected" | "disconnected" | "loading">("loading");
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
      const res = await apiFetch("/api/gateway/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Disconnect failed");
      setModal({ isOpen: true, title: "Berhasil", message: "Gateway WA telah diputuskan", type: "success" });
    } catch {
      setModal({ isOpen: true, title: "Error", message: "Gagal memutuskan gateway", type: "error" });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await apiFetch("/api/gateway/connect", { method: "POST" });
      if (!res.ok) throw new Error("Connect failed");
      setModal({ isOpen: true, title: "Berhasil", message: "Gateway WA sedang menghubungkan", type: "success" });
    } catch {
      setModal({ isOpen: true, title: "Error", message: "Gagal menghubungkan gateway", type: "error" });
    } finally {
      setConnecting(false);
    }
  };

  const statusConfig = {
    connected: {
      color: "from-emerald-500/20 to-emerald-500/5 border-emerald-500/20",
      dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]",
      label: "Terhubung",
      icon: Wifi,
      iconColor: "text-emerald-400",
    },
    disconnected: {
      color: "from-red-500/10 to-red-500/5 border-red-500/20",
      dot: "bg-red-400",
      label: "Terputus",
      icon: WifiOff,
      iconColor: "text-red-400",
    },
    loading: {
      color: "from-amber-500/10 to-amber-500/5 border-amber-500/20",
      dot: "bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.5)]",
      label: "Memeriksa...",
      icon: Activity,
      iconColor: "text-amber-400",
    },
  };

  const current = statusConfig[status];
  const StatusIcon = current.icon;

  return (
    <div className="max-w-lg animate-fadeIn">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <Radio size={16} className="text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-100">WhatsApp Gateway</h2>
          <p className="text-xs text-slate-500">Status koneksi WhatsApp</p>
        </div>
      </div>

      <div className={"rounded-xl border bg-gradient-to-b p-6 " + current.color}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-slate-950/50 flex items-center justify-center border border-slate-800/50">
            <StatusIcon size={20} className={current.iconColor} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={"w-2 h-2 rounded-full " + current.dot} />
              <span className="text-sm font-semibold text-slate-200">{current.label}</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {status === "connected" ? "WhatsApp terhubung dan siap melayani" : status === "disconnected" ? "Gateway tidak terhubung" : "Menghubungkan..."}
            </p>
          </div>
          {status === "disconnected" && (
            <button
              onClick={() => {
                apiFetch("/api/gateway/qr")
                  .then((r) => r.json())
                  .then((d) => setQrCode(d.qr_code || d.qr || null))
                  .catch(() => {});
              }}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800 transition-colors"
            >
              <RefreshCw size={12} />
              Refresh QR
            </button>
          )}
        </div>

        {qrCode && status === "disconnected" && (
          <div className="flex flex-col items-center gap-3 mb-5">
            <p className="text-xs text-slate-400">Scan QR code ini dengan WhatsApp</p>
            <div className="rounded-xl bg-white p-4 shadow-lg">
              <img
                src={qrCode.startsWith("data:") ? qrCode : "data:image/png;base64," + qrCode}
                alt="QR Code"
                className="w-48 h-48"
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleConnect}
            disabled={connecting || status === "connected"}
            className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Link2 size={15} />
            {connecting ? "Menghubungkan..." : "Connect"}
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting || status !== "connected"}
            className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Power size={15} />
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
    { id: string; user_name?: string; action: string; details?: string; created_at: string }[]
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
    <div className="animate-fadeIn">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <ClipboardList size={16} className="text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Audit Log</h2>
          <p className="text-xs text-slate-500">Riwayat aktivitas sistem</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-emerald-500 animate-spin" />
            <span className="text-sm">Memuat log...</span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50">
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Waktu</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Aksi</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <ClipboardList size={24} className="text-slate-700" />
                      <p className="text-sm text-slate-500">Belum ada log</p>
                    </div>
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3.5 text-slate-500 font-mono text-xs">
                    {new Date(log.created_at).toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3.5 text-slate-300 text-xs">{log.user_name || "-"}</td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-500 text-xs max-w-xs truncate">{log.details || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CSConfigPanel() {
  const [config, setConfig] = useState<{ 
    signatureEnabled: boolean; 
    signatureTemplate: string; 
    quickReplies: string[];
    autoReplyClaimEnabled: boolean;
    autoReplyClaim: string;
    autoReplyResolveEnabled: boolean;
    autoReplyResolve: string;
    waGroupNotifEnabled: boolean;
    waGroupJid: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", type: "info" });

  useEffect(() => {
    apiFetch("/api/admin/cs-config")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setConfig(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/cs-config", {
        method: "PUT",
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Gagal menyimpan konfigurasi");
      const data = await res.json();
      setConfig(data);
      setModal({
        isOpen: true,
        title: "Berhasil",
        message: "Pengaturan CS berhasil disimpan",
        type: "success",
      });
    } catch (err: any) {
      setModal({
        isOpen: true,
        title: "Error",
        message: err.message || "Gagal menyimpan konfigurasi CS",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-slate-400 p-8 text-center animate-pulse">Memuat...</div>;
  if (!config) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
          <MessageSquare size={20} className="text-purple-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-100">Pengaturan Customer Service</h2>
          <p className="text-sm text-slate-400">Atur penanda (signature) dan template otomatis CS</p>
        </div>
      </div>

      <div className="bg-[#0B1221] rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-300">Aktifkan Signature Otomatis</label>
              <button
                onClick={() => setConfig({ ...config, signatureEnabled: !config.signatureEnabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.signatureEnabled ? "bg-emerald-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.signatureEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-slate-500">Jika aktif, sistem akan otomatis menambahkan signature di akhir setiap pesan yang dikirim oleh CS.</p>
          </div>

          {config.signatureEnabled && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-300">
              <label className="block text-sm font-semibold text-slate-300 mb-2">
                Template Signature
              </label>
              <input
                type="text"
                value={config.signatureTemplate}
                onChange={(e) => setConfig({ ...config, signatureTemplate: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                placeholder="Misal: - {name} (Customer Service)"
              />
              <p className="mt-2 text-xs text-slate-500">
                Gunakan <code className="text-emerald-400 bg-emerald-400/10 px-1 py-0.5 rounded">{"{name}"}</code> untuk menampilkan nama CS yang sedang mengirim pesan.
              </p>

              <div className="mt-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700">
                <span className="text-xs text-slate-500 mb-2 block font-medium">Pratinjau (Preview):</span>
                <div className="text-sm text-slate-300">
                  <p>Halo, ada yang bisa saya bantu?</p>
                  <p className="mt-2 text-slate-400 whitespace-pre-wrap">{config.signatureTemplate.replace("{name}", "Budi")}</p>
                </div>
              </div>
            </div>
          )}

          <div className="pt-6 border-t border-slate-800">
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Template Balasan Cepat (Quick Replies)
            </label>
            <p className="text-xs text-slate-500 mb-3">Masukkan satu template per baris. Template ini akan muncul sebagai tombol pintas bagi CS saat membalas chat.</p>
            <textarea
              value={config.quickReplies?.join("\n") || ""}
              onChange={(e) => setConfig({ ...config, quickReplies: e.target.value.split("\n") })}
              rows={4}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 custom-scrollbar"
              placeholder="Halo, ada yang bisa kami bantu?&#10;Mohon tunggu sebentar ya..."
            />
          </div>

          <div className="pt-6 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-300">Pesan Otomatis: Saat Chat Diambil (Claim)</label>
              <button
                onClick={() => setConfig({ ...config, autoReplyClaimEnabled: !config.autoReplyClaimEnabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.autoReplyClaimEnabled ? "bg-emerald-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.autoReplyClaimEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {config.autoReplyClaimEnabled && (
              <div className="mt-3 animate-in fade-in slide-in-from-top-2">
                <textarea
                  value={config.autoReplyClaim}
                  onChange={(e) => setConfig({ ...config, autoReplyClaim: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  placeholder="Misal: Halo, dengan CS {name} di sini..."
                />
                <p className="mt-1 text-xs text-slate-500">Gunakan {"{name}"} untuk menyisipkan nama CS.</p>
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-300">Pesan Otomatis: Saat Chat Diselesaikan (Resolve)</label>
              <button
                onClick={() => setConfig({ ...config, autoReplyResolveEnabled: !config.autoReplyResolveEnabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.autoReplyResolveEnabled ? "bg-emerald-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.autoReplyResolveEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {config.autoReplyResolveEnabled && (
              <div className="mt-3 animate-in fade-in slide-in-from-top-2">
                <textarea
                  value={config.autoReplyResolve}
                  onChange={(e) => setConfig({ ...config, autoReplyResolve: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  placeholder="Misal: Terima kasih telah menghubungi kami..."
                />
                <p className="mt-1 text-xs text-slate-500">Gunakan {"{name}"} untuk menyisipkan nama CS (opsional).</p>
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-300">Notifikasi Grup WhatsApp</label>
              <button
                onClick={() => setConfig({ ...config, waGroupNotifEnabled: !config.waGroupNotifEnabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  config.waGroupNotifEnabled ? "bg-emerald-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config.waGroupNotifEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">Kirim notifikasi otomatis ke grup WhatsApp setiap ada aktivitas pelanggan (customer baru, request CS, chat diklaim, chat diselesaikan).</p>
            {config.waGroupNotifEnabled && (
              <div className="animate-in fade-in slide-in-from-top-2">
                <label className="block text-sm font-semibold text-slate-300 mb-2">
                  ID Grup WhatsApp (JID)
                </label>
                <input
                  type="text"
                  value={config.waGroupJid}
                  onChange={(e) => setConfig({ ...config, waGroupJid: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                  placeholder="Contoh: 123456789-987654321@g.us"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Kirim pesan <code className="text-emerald-400 bg-emerald-400/10 px-1 py-0.5 rounded">!jid</code> di grup WhatsApp untuk mendapatkan ID grup. Format: <code className="text-emerald-400 bg-emerald-400/10 px-1 py-0.5 rounded">xxxxx-xxxxx@g.us</code>
                </p>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
              Simpan Pengaturan
            </button>
          </div>
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
