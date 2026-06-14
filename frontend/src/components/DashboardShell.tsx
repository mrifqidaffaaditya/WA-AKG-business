"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Modal from "@/components/Modal";
import { apiFetch } from "@/lib/api";
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
  ChevronLeft,
  Menu,
  X as XIcon,
} from "lucide-react";

interface DashboardShellProps {
  children: React.ReactNode;
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const { user, logout, updateUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
    sound_notification: typeof window !== "undefined" ? localStorage.getItem("sound_enabled") !== "false" : true,
  });

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const basePath = isAdmin ? "/admin" : "/cs";
  const isAdminPage = pathname?.startsWith("/admin");

  const isTabActive = (tab: string) => {
    const currentTab = searchParams?.get("tab") || "";
    if (!currentTab && tab === "dashboard" && isAdminPage) return true;
    if (!currentTab && tab === "all" && !isAdminPage) return true;
    return currentTab === tab;
  };

  const navItems = isAdmin
    ? [
        { label: "Dashboard", icon: LayoutDashboard, tab: "dashboard" },
        { label: "Bot Config", icon: Bot, tab: "bot" },
        { label: "Stok", icon: Package, tab: "stock" },
        { label: "Users", icon: Users, tab: "users" },
        { label: "Gateway", icon: Radio, tab: "gateway" },
        { label: "Audit Log", icon: ClipboardList, tab: "audit" },
        { label: "Pengaturan CS", icon: Headset, tab: "cs_config" },
      ]
    : [
        { label: "My Chats", icon: Users, tab: "mine" },
        { label: "Waiting", icon: MessageCircle, tab: "waiting" },
        { label: "All", icon: ClipboardList, tab: "all" },
      ];

  const handleSaveProfile = async () => {
    try {
      const res = await apiFetch("/api/auth/profile", {
        method: "PUT",
        body: JSON.stringify(profileForm),
      });
      if (res.ok) {
        updateUser({ name: profileForm.name });
        localStorage.setItem("sound_enabled", profileForm.sound_notification.toString());
        setModalState({
          isOpen: true,
          title: "Berhasil",
          message: "Profil berhasil disimpan",
          type: "success",
        });
        setSettingsOpen(false);
      } else {
        throw new Error("Gagal menyimpan");
      }
    } catch {
      setModalState({
        isOpen: true,
        title: "Error",
        message: "Gagal menyimpan profil",
        type: "error",
      });
    }
  };

  const roleColors: Record<string, string> = {
    super_admin: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    admin: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    cs: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  };

  const roleLabels: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "Admin",
    cs: "CS",
  };

  return (
    <div className="flex h-[100dvh] bg-[#0A0F1C] overflow-hidden text-slate-300 font-sans selection:bg-emerald-500/30">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-800/60 bg-[#0B1221] shadow-2xl transition-all duration-300 transform " +
          (mobileOpen ? "translate-x-0 " : "-translate-x-full ") +
          "md:relative md:translate-x-0 shrink-0 " +
          (collapsed ? "md:w-20" : "w-64")
        }
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-800/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400/20 to-emerald-600/20 border border-emerald-500/20 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/10">
              <MessageCircle size={20} className="text-emerald-400" />
            </div>
            {(!collapsed || mobileOpen) && (
              <span className="text-base font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400 truncate">
                WA-AKG
              </span>
            )}
          </div>
          <button 
            className="md:hidden p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-lg transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            <XIcon size={20} />
          </button>
        </div>

        <nav className="flex-1 flex flex-col px-3 py-6 gap-2 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {navItems.map((item) => (
            <button
              key={item.tab}
              onClick={() => {
                router.push(basePath + "?tab=" + item.tab);
                setMobileOpen(false);
              }}
              className={
                "flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm transition-all duration-200 group relative overflow-hidden " +
                (isTabActive(item.tab)
                  ? "bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/10 shadow-sm"
                  : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200 border border-transparent")
              }
              title={collapsed && !mobileOpen ? item.label : undefined}
            >
              <item.icon
                size={20}
                className={
                  "shrink-0 transition-transform duration-200 " +
                  (isTabActive(item.tab) ? "text-emerald-400 scale-110" : "group-hover:scale-110 group-hover:text-slate-300")
                }
              />
              {(!collapsed || mobileOpen) && <span className="truncate">{item.label}</span>}
              {isTabActive(item.tab) && (!collapsed || mobileOpen) && (
                <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              )}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-slate-800/60 bg-slate-950/30 flex flex-col gap-2">
          {isAdmin && (
            <button
              onClick={() => {
                router.push("/cs?tab=all");
                setMobileOpen(false);
              }}
              className="flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm text-slate-400 hover:bg-slate-800/50 hover:text-emerald-300 transition-all duration-200 w-full group border border-transparent"
              title={collapsed && !mobileOpen ? "Panel CS" : undefined}
            >
              <Headset size={20} className="shrink-0 group-hover:scale-110 transition-transform" />
              {(!collapsed || mobileOpen) && <span className="truncate font-medium">Panel CS</span>}
            </button>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm text-slate-500 hover:bg-slate-800/50 hover:text-slate-300 transition-all duration-200 w-full group border border-transparent"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? (
              <PanelLeftOpen size={20} className="shrink-0 group-hover:scale-110 transition-transform" />
            ) : (
              <PanelLeftClose size={20} className="shrink-0 group-hover:scale-110 transition-transform" />
            )}
            {!collapsed && <span className="truncate font-medium">Collapse</span>}
          </button>

          <button
            onClick={() => {
              setProfileForm((f) => ({ ...f, name: user?.name || "" }));
              setSettingsOpen(true);
              setMobileOpen(false);
            }}
            className="flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 transition-all duration-200 w-full group border border-transparent"
            title={collapsed && !mobileOpen ? "Pengaturan" : undefined}
          >
            <Settings size={20} className="shrink-0 group-hover:scale-110 transition-transform group-hover:rotate-45" />
            {(!collapsed || mobileOpen) && <span className="truncate font-medium">Pengaturan</span>}
          </button>

          <button
            onClick={logout}
            className="flex items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 w-full group border border-transparent hover:border-red-500/20"
            title={collapsed && !mobileOpen ? "Keluar" : undefined}
          >
            <LogOut size={20} className="shrink-0 group-hover:scale-110 transition-transform" />
            {(!collapsed || mobileOpen) && <span className="truncate font-medium">Keluar</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 bg-[#0A0F1C]">
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 border-b border-slate-800/60 bg-[#0B1221]/80 backdrop-blur-md sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 -ml-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
            >
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                WA-AKG Business
              </h1>
              <span className="text-[10px] sm:text-xs text-emerald-400/80 font-medium px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 hidden sm:inline-flex">
                {isAdminPage ? "Panel Admin" : "Panel CS"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-sm font-semibold text-slate-200 max-w-[150px] truncate">
                {user?.name || "Guest"}
              </span>
              <span
                className={
                  "text-[10px] mt-0.5 px-2 py-0.5 rounded-md font-medium border " +
                  (roleColors[user?.role || "cs"] || roleColors.cs)
                }
              >
                {roleLabels[user?.role || "cs"] || "CS"}
              </span>
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center text-sm font-bold text-slate-300 shadow-inner">
              {(user?.name || "G")[0].toUpperCase()}
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
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Nama Lengkap</label>
            <input
              type="text"
              value={profileForm.name}
              onChange={(e) =>
                setProfileForm((f) => ({ ...f, name: e.target.value }))
              }
              className="w-full rounded-xl bg-[#0B1221] border border-slate-700/60 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-inner"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Template Klaim (opsional)
            </label>
            <textarea
              value={profileForm.claim_template}
              onChange={(e) =>
                setProfileForm((f) => ({ ...f, claim_template: e.target.value }))
              }
              rows={3}
              className="w-full rounded-xl bg-[#0B1221] border border-slate-700/60 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 resize-none transition-all shadow-inner"
              placeholder="Halo, saya CS akan membantu Anda..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Template Tutup (opsional)
            </label>
            <textarea
              value={profileForm.close_template}
              onChange={(e) =>
                setProfileForm((f) => ({ ...f, close_template: e.target.value }))
              }
              rows={3}
              className="w-full rounded-xl bg-[#0B1221] border border-slate-700/60 px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 resize-none transition-all shadow-inner"
              placeholder="Terima kasih, percakapan ini ditutup..."
            />
          </div>
          <div className="flex items-center gap-3 py-2 bg-slate-800/30 px-4 rounded-xl border border-slate-800/60">
            <div className="w-8 h-8 rounded-lg bg-slate-800/80 flex items-center justify-center shrink-0">
              <Volume2 size={16} className="text-emerald-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-slate-200">Suara Notifikasi</span>
              <span className="text-[11px] text-slate-500">Bunyi saat pesan baru masuk</span>
            </div>
            <button
              onClick={() =>
                setProfileForm((f) => ({
                  ...f,
                  sound_notification: !f.sound_notification,
                }))
              }
              className={
                "ml-auto relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 " +
                (profileForm.sound_notification ? "bg-emerald-500" : "bg-slate-700")
              }
            >
              <span
                className={
                  "absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform duration-300 shadow-sm " +
                  (profileForm.sound_notification ? "translate-x-6" : "translate-x-0")
                }
              />
            </button>
          </div>
          <button
            onClick={handleSaveProfile}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 py-3 text-sm font-semibold text-white transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 active:scale-[0.98]"
          >
            <Save size={18} />
            Simpan Perubahan
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={modalState.isOpen}
        onClose={() => setModalState((m) => ({ ...m, isOpen: false }))}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
      />
    </div>
  );
}
