"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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
} from "lucide-react";

interface DashboardShellProps {
  children: React.ReactNode;
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const { user, logout, updateUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
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
    sound_notification: true,
  });

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const basePath = isAdmin ? "/admin" : "/cs";

  const navItems = isAdmin
    ? [
        { label: "Dashboard", icon: LayoutDashboard, href: "/admin?tab=dashboard" },
        { label: "Bot Config", icon: Bot, href: "/admin?tab=bot" },
        { label: "Stok", icon: Package, href: "/admin?tab=stock" },
        { label: "Users", icon: Users, href: "/admin?tab=users" },
        { label: "Gateway", icon: Radio, href: "/admin?tab=gateway" },
        { label: "Audit Log", icon: ClipboardList, href: "/admin?tab=audit" },
      ]
    : [
        { label: "Chat", icon: MessageCircle, href: "/cs?tab=waiting" },
        { label: "My Chats", icon: MessageCircle, href: "/cs?tab=mine" },
      ];

  const handleSaveProfile = async () => {
    try {
      const res = await apiFetch("/api/auth/profile", {
        method: "PUT",
        body: JSON.stringify(profileForm),
      });
      if (res.ok) {
        updateUser({ name: profileForm.name });
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

  return (
    <div className="flex h-screen bg-slate-950">
      <nav className="w-16 flex flex-col items-center border-r border-slate-800 py-4 gap-2 bg-slate-950">
        <button
          onClick={() => router.push(basePath)}
          className="rounded-xl p-2 text-emerald-400 hover:bg-slate-800 transition-colors"
          title="Dashboard"
        >
          <MessageCircle size={24} />
        </button>

        <div className="w-8 h-px bg-slate-800 my-2" />

        {navItems.map((item) => (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            className={
              "rounded-xl p-2 transition-colors " +
              (pathname + (typeof window !== "undefined" ? window.location.search : "")).includes(
                item.href.split("?tab=")[1]
              )
                ? "bg-slate-800 text-emerald-400"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }
            title={item.label}
          >
            <item.icon size={20} />
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={() => {
            setProfileForm((f) => ({ ...f, name: user?.name || "" }));
            setSettingsOpen(true);
          }}
          className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          title="Settings"
        >
          <Settings size={20} />
        </button>

        <button
          onClick={logout}
          className="rounded-xl p-2 text-slate-400 hover:bg-red-500/15 hover:text-red-400 transition-colors"
          title="Logout"
        >
          <LogOut size={20} />
        </button>
      </nav>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center justify-between px-4 border-b border-slate-800 bg-slate-950 shrink-0">
          <h1 className="text-sm font-semibold text-slate-200">WA-AKG Business</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{user?.name}</span>
            <span
              className={
                "text-xs px-2 py-0.5 rounded-full font-medium " +
                (user?.role === "super_admin"
                  ? "bg-purple-500/15 text-purple-400"
                  : user?.role === "admin"
                  ? "bg-blue-500/15 text-blue-400"
                  : "bg-emerald-500/15 text-emerald-400")
              }
            >
              {user?.role === "super_admin" ? "Super Admin" : user?.role === "admin" ? "Admin" : "CS"}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-hidden">{children}</main>
      </div>

      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Settings"
      >
        <div className="space-y-4 mt-2">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nama</label>
            <input
              type="text"
              value={profileForm.name}
              onChange={(e) =>
                setProfileForm((f) => ({ ...f, name: e.target.value }))
              }
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Template Klaim (opsional)
            </label>
            <textarea
              value={profileForm.claim_template}
              onChange={(e) =>
                setProfileForm((f) => ({ ...f, claim_template: e.target.value }))
              }
              rows={2}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600 resize-none"
              placeholder="Halo, saya CS akan membantu Anda..."
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Template Tutup (opsional)
            </label>
            <textarea
              value={profileForm.close_template}
              onChange={(e) =>
                setProfileForm((f) => ({ ...f, close_template: e.target.value }))
              }
              rows={2}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-600 resize-none"
              placeholder="Terima kasih, percakapan ini ditutup..."
            />
          </div>
          <div className="flex items-center gap-3 py-1">
            <Volume2 size={16} className="text-slate-400" />
            <span className="text-sm text-slate-300">Suara Notifikasi</span>
            <button
              onClick={() =>
                setProfileForm((f) => ({
                  ...f,
                  sound_notification: !f.sound_notification,
                }))
              }
              className={
                "ml-auto relative w-10 h-6 rounded-full transition-colors " +
                (profileForm.sound_notification ? "bg-emerald-500" : "bg-slate-700")
              }
            >
              <span
                className={
                  "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform " +
                  (profileForm.sound_notification ? "translate-x-4" : "translate-x-0")
                }
              />
            </button>
          </div>
          <button
            onClick={handleSaveProfile}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-500 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors"
          >
            <Save size={16} />
            Simpan
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
