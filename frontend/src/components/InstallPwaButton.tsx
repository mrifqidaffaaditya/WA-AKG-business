"use client";

import { useState } from "react";
import { Download, Smartphone, Share2, PlusSquare, Check } from "lucide-react";
import { usePwaInstall } from "@/components/PwaRegister";
import Modal from "@/components/Modal";

interface InstallPwaButtonProps {
  variant?: "button" | "banner" | "sidebar";
  className?: string;
}

export function InstallPwaButton({
  variant = "button",
  className = "",
}: InstallPwaButtonProps) {
  const { canInstall, isStandalone, isIOS, promptInstall } = usePwaInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [installedSuccess, setInstalledSuccess] = useState(false);

  // If already installed and running standalone, do not show install prompt
  if (isStandalone || installedSuccess) {
    return null;
  }

  const handleInstallClick = async () => {
    if (canInstall) {
      const accepted = await promptInstall();
      if (accepted) {
        setInstalledSuccess(true);
      }
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      {variant === "sidebar" && (
        <button
          type="button"
          onClick={handleInstallClick}
          aria-label="Pasang Aplikasi di HP"
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition-all cursor-pointer ${className}`}
        >
          <Smartphone size={16} className="text-amber-400 shrink-0" />
          <span className="truncate">Instal Aplikasi di HP</span>
        </button>
      )}

      {variant === "button" && (
        <button
          type="button"
          onClick={handleInstallClick}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-400 hover:border-amber-500/30 transition-all cursor-pointer ${className}`}
        >
          <Smartphone size={14} className="text-amber-400" />
          <span>Pasang Aplikasi</span>
        </button>
      )}

      {variant === "banner" && (
        <div
          className={`w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-lg shadow-black/20 ${className}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Smartphone size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-200">
                Aplikasi HP Siap Dipasang
              </p>
              <p className="text-xs text-slate-400">
                Akses cepat & notifikasi langsung dari layar utama
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold shrink-0 transition-colors cursor-pointer"
          >
            <Download size={14} />
            <span>Pasang</span>
          </button>
        </div>
      )}

      {/* Guide Modal for iOS or manual install */}
      <Modal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        title="Pasang Aplikasi WA-AKG"
        type="info"
      >
        <div className="space-y-4 text-xs text-slate-300">
          <p className="text-slate-400">
            Aplikasi ini dapat dipasang langsung ke layar utama HP Anda tanpa melalui Play Store / App Store:
          </p>

          {isIOS ? (
            <div className="space-y-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <p className="font-medium text-slate-200 flex items-center gap-1.5">
                    Ketuk tombol Bagikan <Share2 size={13} className="text-sky-400 inline" />
                  </p>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Tombol kotak dengan tanda panah ke atas di bagian bawah layar Safari.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <p className="font-medium text-slate-200 flex items-center gap-1.5">
                    Pilih &quot;Tambah ke Layar Utama&quot; <PlusSquare size={13} className="text-sky-400 inline" />
                  </p>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Gulir ke bawah di menu opsi hingga menemukan pilihan ini.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <p className="font-medium text-slate-200 flex items-center gap-1.5">
                    Ketuk &quot;Tambah&quot; <Check size={13} className="text-emerald-400 inline" />
                  </p>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Di pojok kanan atas layar untuk menyelesaikan pemasangan.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </div>
                <div>
                  <p className="font-medium text-slate-200">
                    Buka menu browser (titik 3 di kanan atas Chrome)
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </div>
                <div>
                  <p className="font-medium text-slate-200">
                    Pilih &quot;Instal aplikasi&quot; atau &quot;Tambahkan ke Layar Utama&quot;
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  3
                </div>
                <div>
                  <p className="font-medium text-slate-200">
                    Konfirmasi dan aplikasi akan muncul di layar HP Anda seperti aplikasi native.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs transition-colors cursor-pointer"
            >
              Mengerti
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
