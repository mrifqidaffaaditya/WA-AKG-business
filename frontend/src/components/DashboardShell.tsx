"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Modal from "@/components/Modal";
import { Toggle } from "@/components/ui";
import { apiFetch, setTokens } from "@/lib/api";
import { connect } from "@/lib/socket";
import { setupPushNotifications } from "@/lib/push";
import { InstallPwaButton } from "@/components/InstallPwaButton";
import {
  MessageCircle,
  Settings,
  LogOut,
  Bot,
  Users,
  Package,
  Radio,
  ClipboardList,
  Volume2,
  Save,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Headset,
  Menu,
  X as XIcon,
  Webhook,
  Key,
  FileCode2,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";

interface DashboardShellProps {
  children: React.ReactNode;
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const { user, logout, updateUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const userRole = user?.role || "cs";
  const userName = user?.name || "Guest";

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", type: "info" });

  const [profileForm, setProfileForm] = useState({
    name: user?.name || "",
    claim_template: "",
    close_template: "",
    sound_notification:
      typeof window !== "undefined"
        ? localStorage.getItem("sound_enabled") !== "false"
        : true,
  });

  // Password self-service change state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // AI Bot status and toggle state
  const [botActive, setBotActive] = useState<boolean | null>(null);
  const [togglingBot, setTogglingBot] = useState(false);

  const isAdmin = userRole === "admin" || userRole === "super_admin";
  const basePath = isAdmin ? "/admin" : "/cs";
  const isAdminPage = pathname?.startsWith("/admin");

  // Fetch initial bot status and listen to realtime socket events
  useEffect(() => {
    setupPushNotifications();

    apiFetch("/api/conversations/bot-status")
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.is_active === "boolean") {
          setBotActive(data.is_active);
        }
      })
      .catch(() => {});

    try {
      const socket = connect();
      const handleBotStatus = (data: { is_active: boolean }) => {
        if (typeof data?.is_active === "boolean") {
          setBotActive(data.is_active);
        }
      };
      socket.on("bot:status", handleBotStatus);
      return () => {
        socket.off("bot:status", handleBotStatus);
      };
    } catch {}
  }, []);

  const handleToggleBot = async () => {
    if (!isAdmin || togglingBot) return;
    setTogglingBot(true);
    try {
      const next = !botActive;
      const res = await apiFetch("/api/admin/bot-config/toggle", {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      });
      if (res.ok) {
        const data = await res.json();
        setBotActive(data.is_active);
        setModalState({
          isOpen: true,
          title: data.is_active ? "Bot AI Diaktifkan" : "Bot AI Dinonaktifkan",
          message: data.is_active
            ? "Bot AI sekarang aktif dan otomatis menjawab pertanyaan pelanggan."
            : "Bot AI dinonaktifkan. Semua pesan baru akan langsung diteruskan ke antrean CS.",
          type: data.is_active ? "success" : "info",
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Gagal mengubah status bot");
      }
    } catch (err: any) {
      setModalState({
        isOpen: true,
        title: "Gagal Mengubah Status Bot",
        message: err.message || "Terjadi kesalahan saat mengubah status Bot AI.",
        type: "error",
      });
    } finally {
      setTogglingBot(false);
    }
  };

  const isTabActive = (tab: string) => {
    if (isAdminPage) {
      const afterAdmin = pathname === "/admin" ? "" : (pathname?.replace("/admin/", "") || "");
      const currentTab = afterAdmin || "dashboard";
      if (tab === "dashboard" && currentTab === "dashboard") return true;
      return currentTab === tab;
    } else {
      const currentTab = searchParams?.get("tab") || "";
      if (!currentTab && tab === "all") return true;
      return currentTab === tab;
    }
  };

  const navItems = isAdmin
    ? [
        { label: "Dashboard", icon: LayoutDashboard, tab: "dashboard" },
        { label: "Bot Config", icon: Bot, tab: "bot" },
        { label: "Stok", icon: Package, tab: "stock" },
        { label: "Users", icon: Users, tab: "users" },
        { label: "Gateway", icon: Radio, tab: "gateway" },
        { label: "Webhooks", icon: Webhook, tab: "webhooks" },
        { label: "API Keys", icon: Key, tab: "api_keys" },
        { label: "API Docs", icon: FileCode2, tab: "docs" },
        { label: "Audit Log", icon: ClipboardList, tab: "audit" },
        { label: "Pengaturan CS", icon: Headset, tab: "cs_config" },
      ]
    : [
        { label: "My Chats", icon: Users, tab: "mine" },
        { label: "Waiting", icon: MessageCircle, tab: "waiting" },
        { label: "All", icon: ClipboardList, tab: "all" },
      ];

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const payload: Record<string, unknown> = {
        name: profileForm.name,
      };

      if (showPasswordChange || passwordForm.currentPassword || passwordForm.newPassword) {
        if (!passwordForm.currentPassword) {
          setModalState({
            isOpen: true,
            title: "Validasi Gagal",
            message: "Password saat ini wajib diisi untuk mengubah password.",
            type: "warning",
          });
          setSavingProfile(false);
          return;
        }
        if (!passwordForm.newPassword || passwordForm.newPassword.length < 6) {
          setModalState({
            isOpen: true,
            title: "Validasi Gagal",
            message: "Password baru minimal 6 karakter.",
            type: "warning",
          });
          setSavingProfile(false);
          return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
          setModalState({
            isOpen: true,
            title: "Validasi Gagal",
            message: "Konfirmasi password baru tidak cocok dengan password baru.",
            type: "warning",
          });
          setSavingProfile(false);
          return;
        }
        payload.currentPassword = passwordForm.currentPassword;
        payload.password = passwordForm.newPassword;
      }

      const res = await apiFetch("/api/auth/profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        if (data.accessToken) {
          setTokens(data.accessToken);
        }
        updateUser({ name: profileForm.name });
        localStorage.setItem(
          "sound_enabled",
          profileForm.sound_notification.toString()
        );
        setPasswordForm({
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        });
        setShowPasswordChange(false);
        setModalState({
          isOpen: true,
          title: "Berhasil",
          message: data.message || "Profil berhasil disimpan",
          type: "success",
        });
        setSettingsOpen(false);
      } else {
        throw new Error(data.error || "Gagal menyimpan profil");
      }
    } catch (err: any) {
      setModalState({
        isOpen: true,
        title: "Error",
        message: err.message || "Gagal menyimpan profil",
        type: "error",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const roleColors: Record<string, string> = {
    super_admin:
      "bg-rose-500/15 text-rose-400 border-rose-500/30",
    admin: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    cs: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  };

  const roleLabels: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    cs: "CS",
  };

  // Return COMPLETE static class strings. Dynamic `from-${hue}-500` strings
  // are purged by Tailwind at build time, which previously left avatars
  // gradient-less. These warm-palette variants are all statically present.
  const avatarGradient = (name: string) => {
    const safe = name || "?";
    const hash = safe.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const gradients = [
      "from-amber-500/25 to-orange-700/25",
      "from-orange-500/25 to-rose-700/25",
      "from-rose-500/25 to-amber-700/25",
      "from-amber-400/25 to-amber-700/25",
      "from-sky-500/25 to-amber-700/25",
      "from-orange-400/25 to-amber-600/25",
    ];
    return gradients[hash % gradients.length];
  };

  // Avatar initial, guarded against empty names (was `userName[0]` → crash).
  const avatarInitial = (userName || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex h-[100dvh] w-full max-w-full bg-slate-950 overflow-hidden text-slate-300 selection:bg-amber-500/30">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-800/50 bg-slate-900/90 backdrop-blur-xl shadow-2xl transition-all duration-300 ease-out transform " +
          (mobileOpen
            ? "translate-x-0 "
            : "-translate-x-full ") +
          "md:relative md:translate-x-0 shrink-0 " +
          (collapsed ? "md:w-[72px]" : "w-64")
        }
      >
        <div className="flex items-center justify-between px-4 h-16 border-b border-slate-800/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0 p-1.5 shadow-sm">
              <img src="/icon.svg" alt="WA-AKG Logo" className="w-full h-full object-contain" />
            </div>
            {(!collapsed || mobileOpen) && (
              <span className="text-base font-bold text-slate-100 tracking-tight truncate">
                WA-AKG
              </span>
            )}
          </div>
          <button
            className="md:hidden p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-lg transition-colors cursor-pointer"
            onClick={() => setMobileOpen(false)}
            aria-label="Tutup menu navigasi"
          >
            <XIcon size={20} />
          </button>
        </div>

        <nav className="flex-1 flex flex-col px-2 py-4 gap-1 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => (
            <button
              key={item.tab}
              onClick={() => {
                const targetPath = isAdmin
                  ? (item.tab === "dashboard" ? "/admin" : "/admin/" + item.tab)
                  : ("/cs?tab=" + item.tab);
                router.push(targetPath);
                setMobileOpen(false);
              }}
              className={
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 cursor-pointer relative " +
                (isTabActive(item.tab)
                  ? "bg-amber-500/10 text-amber-400 font-semibold"
                  : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200")
              }
              title={
                collapsed && !mobileOpen ? item.label : undefined
              }
            >
              {isTabActive(item.tab) && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
              )}
              <item.icon
                size={20}
                className={
                  "shrink-0 transition-all duration-200 " +
                  (isTabActive(item.tab)
                    ? "text-amber-400"
                    : "group-hover:text-slate-300")
                }
              />
              {(!collapsed || mobileOpen) && (
                <span className="truncate">{item.label}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="px-2 py-3 border-t border-slate-800/50 flex flex-col gap-1">
          {isAdmin && (
            <button
              onClick={() => {
                router.push("/cs?tab=all");
                setMobileOpen(false);
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800/50 hover:text-amber-300 transition-all duration-200 cursor-pointer"
              title={
                collapsed && !mobileOpen ? "Panel CS" : undefined
              }
            >
              <Headset
                size={20}
                className="shrink-0 transition-transform duration-200 hover:scale-110"
              />
              {(!collapsed || mobileOpen) && (
                <span className="truncate font-medium">Panel CS</span>
              )}
            </button>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
            className="hidden md:flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 hover:bg-slate-800/50 hover:text-slate-300 transition-all duration-200 cursor-pointer"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? (
              <PanelLeftOpen
                size={20}
                className="shrink-0 transition-transform duration-200"
              />
            ) : (
              <PanelLeftClose
                size={20}
                className="shrink-0 transition-transform duration-200"
              />
            )}
            {!collapsed && (
              <span className="truncate font-medium">Collapse</span>
            )}
          </button>

          {(!collapsed || mobileOpen) && (
            <InstallPwaButton variant="sidebar" className="mb-1" />
          )}

          <button
            onClick={() => {
              setProfileForm((f) => ({
                ...f,
                name: user?.name || "",
              }));
              setPasswordForm({
                currentPassword: "",
                newPassword: "",
                confirmPassword: "",
              });
              setShowPasswordChange(false);
              setSettingsOpen(true);
              setMobileOpen(false);
            }}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-all duration-200 cursor-pointer"
            title={
              collapsed && !mobileOpen
                ? "Pengaturan"
                : undefined
            }
          >
            <Settings
              size={20}
              className="shrink-0 transition-transform duration-300 hover:rotate-90"
            />
            {(!collapsed || mobileOpen) && (
              <span className="truncate font-medium">Pengaturan</span>
            )}
          </button>

          <button
            onClick={logout}
            aria-label="Keluar dari akun"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 hover:bg-rose-500/10 hover:text-rose-400 transition-all duration-200 cursor-pointer"
            title={
              collapsed && !mobileOpen ? "Keluar" : undefined
            }
          >
            <LogOut
              size={20}
              className="shrink-0 transition-transform duration-200 hover:scale-110"
            />
            {(!collapsed || mobileOpen) && (
              <span className="truncate font-medium">Keluar</span>
            )}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-slate-800/50 glass shrink-0 z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Buka menu navigasi"
              className="md:hidden p-2 -ml-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors cursor-pointer"
            >
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                WA-AKG Business
              </h1>
              <span className="text-[10px] sm:text-xs text-amber-400/90 font-medium px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 hidden sm:inline-flex">
                {isAdminPage ? "Panel Admin" : "Panel CS"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {botActive !== null && (
              isAdmin ? (
                <button
                  onClick={handleToggleBot}
                  disabled={togglingBot}
                  title={botActive ? "Bot AI aktif melayani pelanggan. Klik untuk menonaktifkan" : "Bot AI nonaktif (pesan langsung ke CS). Klik untuk mengaktifkan"}
                  className={`group flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                    botActive
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 shadow-sm shadow-emerald-500/10"
                      : "bg-slate-800/80 text-slate-400 border-slate-700/80 hover:bg-slate-800 hover:text-slate-200"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      botActive ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" : "bg-slate-500"
                    }`}
                  />
                  <Bot size={13} className="shrink-0" />
                  <span className="font-semibold">{botActive ? "AI: ON" : "AI: OFF"}</span>
                  <span className="hidden md:inline-block text-[10px] px-1.5 py-0.5 rounded bg-slate-900/60 border border-slate-700/50 text-slate-400 group-hover:text-slate-200">
                    {togglingBot ? "..." : (botActive ? "Matikan" : "Nyalakan")}
                  </span>
                </button>
              ) : (
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 sm:py-1.5 rounded-full text-xs font-medium border ${
                    botActive
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-slate-800/80 text-slate-400 border-slate-700/80"
                  }`}
                  title={botActive ? "Bot AI aktif melayani pesan pelanggan" : "Bot AI nonaktif, pesan langsung ke antrean CS"}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      botActive ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" : "bg-slate-500"
                    }`}
                  />
                  <Bot size={13} className="shrink-0" />
                  <span className="font-semibold">{botActive ? "AI: Aktif" : "AI: Nonaktif"}</span>
                </div>
              )
            )}
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-sm font-semibold text-slate-200 max-w-[150px] truncate">
                {userName}
              </span>
              <span
                className={
                  "text-[10px] mt-0.5 px-2 py-0.5 rounded-md font-medium border " +
                  (roleColors[userRole] ||
                    roleColors.cs)
                }
              >
                {roleLabels[userRole] || "CS"}
              </span>
            </div>
            <div className="relative">
              <div
                className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(
                  userName
                )} border border-amber-500/20 flex items-center justify-center text-sm font-bold text-slate-200 shadow-inner`}
                aria-hidden="true"
              >
                {avatarInitial}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-500 border-2 border-slate-950 shadow-sm" />
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col overflow-hidden relative">
          {children}
        </main>
      </div>

      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Pengaturan Profil"
      >
        <div className="space-y-5 mt-4">
          <div>
            <label htmlFor="profile-name" className="block text-xs font-medium text-slate-400 mb-1.5">
              Nama Lengkap
            </label>
            <input
              id="profile-name"
              type="text"
              value={profileForm.name}
              onChange={(e) =>
                setProfileForm((f) => ({
                  ...f,
                  name: e.target.value,
                }))
              }
              className="w-full rounded-xl bg-slate-900 border border-slate-700/60 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus-visible:outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 transition-all"
            />
          </div>
          <div>
            <label htmlFor="profile-claim" className="block text-xs font-medium text-slate-400 mb-1.5">
              Template Klaim (opsional)
            </label>
            <textarea
              id="profile-claim"
              value={profileForm.claim_template}
              onChange={(e) =>
                setProfileForm((f) => ({
                  ...f,
                  claim_template: e.target.value,
                }))
              }
              rows={3}
              className="w-full rounded-xl bg-slate-900 border border-slate-700/60 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus-visible:outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 resize-none transition-all"
              placeholder="Halo, saya CS akan membantu Anda..."
            />
          </div>
          <div>
            <label htmlFor="profile-close" className="block text-xs font-medium text-slate-400 mb-1.5">
              Template Tutup (opsional)
            </label>
            <textarea
              id="profile-close"
              value={profileForm.close_template}
              onChange={(e) =>
                setProfileForm((f) => ({
                  ...f,
                  close_template: e.target.value,
                }))
              }
              rows={3}
              className="w-full rounded-xl bg-slate-900 border border-slate-700/60 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus-visible:outline-none focus:border-amber-500/60 focus:ring-2 focus:ring-amber-500/20 resize-none transition-all"
              placeholder="Terima kasih, percakapan ini ditutup..."
            />
          </div>
          <div className="flex items-center gap-3 py-2 bg-slate-800/30 px-4 rounded-xl border border-slate-800/60">
            <div className="w-8 h-8 rounded-lg bg-slate-800/80 flex items-center justify-center shrink-0">
              <Volume2 size={16} className="text-amber-400" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-200">
                Suara Notifikasi
              </span>
              <span className="text-[11px] text-slate-500">
                Bunyi saat pesan baru masuk
              </span>
            </div>
            <div className="ml-auto">
              <Toggle
                checked={profileForm.sound_notification}
                onChange={(next) =>
                  setProfileForm((f) => ({ ...f, sound_notification: next }))
                }
                label="Aktifkan suara notifikasi"
              />
            </div>
          </div>

          {/* Fitur Ubah Password Akun Sendiri */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5 space-y-3">
            <div
              className="flex items-center justify-between cursor-pointer select-none"
              onClick={() => setShowPasswordChange(!showPasswordChange)}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                  <Lock size={15} />
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-200 block">
                    Ubah Password Akun
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    Ganti kata sandi login Anda sendiri
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
              >
                {showPasswordChange ? "Sembunyikan" : "Ubah"}
              </button>
            </div>

            {showPasswordChange && (
              <div className="space-y-3 pt-2.5 border-t border-slate-800">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Password Saat Ini <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={passwordForm.currentPassword}
                      onChange={(e) =>
                        setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))
                      }
                      placeholder="Masukkan password lama"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 pr-10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      {showCurrentPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Password Baru (min. 6 karakter) <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))
                      }
                      placeholder="Minimal 6 karakter"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 pr-10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      {showNewPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Konfirmasi Password Baru <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))
                      }
                      placeholder="Ulangi password baru"
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 pr-10 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 py-3 text-sm font-semibold text-slate-950 transition-all shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 active:scale-[0.98] cursor-pointer disabled:opacity-50"
          >
            {savingProfile ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Save size={18} />
                Simpan Perubahan
              </>
            )}
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={modalState.isOpen}
        onClose={() =>
          setModalState((m) => ({ ...m, isOpen: false }))
        }
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
      />
    </div>
  );
}
