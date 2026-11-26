"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  X,
  Send,
  Plus,
  Trash2,
  CheckCircle2,
  Tag,
  ListFilter,
  MousePointerClick,
  MessageSquare,
  UtensilsCrossed,
  Sparkles,
  ExternalLink,
  Phone,
  Copy,
  Package,
} from "lucide-react";

type ButtonType = "quick_reply" | "cta_url" | "cta_call" | "cta_copy";

interface ButtonItem {
  key: string;
  type: ButtonType;
  label: string;
  value: string;
}

interface MenuRow {
  key: string;
  title: string;
  description: string;
}

interface StockMenuItem {
  id: string;
  name: string;
  priceLabel: string;
  stockLabel: string;
}

interface InteractiveMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  customerName?: string | null;
  onSent?: () => void;
}

const BUTTON_TYPE_LABEL: Record<ButtonType, string> = {
  quick_reply: "Balasan Cepat",
  cta_url: "Buka Link",
  cta_call: "Telepon",
  cta_copy: "Salin Kode",
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

const inputClass =
  "w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all";

const labelClass = "block text-[11px] font-medium text-slate-400 mb-1.5";

export default function InteractiveMessageModal({
  isOpen,
  onClose,
  conversationId,
  customerName,
  onSent,
}: InteractiveMessageModalProps) {
  const [mode, setMode] = useState<"buttons" | "list">("buttons");
  const [title, setTitle] = useState("Konfirmasi");
  const [body, setBody] = useState("");
  const [footer, setFooter] = useState("Pilih salah satu tombol di bawah");

  const [buttons, setButtons] = useState<ButtonItem[]>([]);
  const [listButtonText, setListButtonText] = useState("📋 Buka Pilihan");
  const [sectionTitle, setSectionTitle] = useState("Pilihan");
  const [rows, setRows] = useState<MenuRow[]>([]);

  const [stockItems, setStockItems] = useState<StockMenuItem[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const displayName = customerName || "Kak";

  const resetTo = (next: {
    mode: "buttons" | "list";
    title: string;
    body: string;
    footer: string;
    buttons?: ButtonItem[];
    rows?: MenuRow[];
    listButtonText?: string;
    sectionTitle?: string;
  }) => {
    setMode(next.mode);
    setTitle(next.title);
    setBody(next.body);
    setFooter(next.footer);
    setButtons(next.buttons || []);
    setRows(next.rows || []);
    setListButtonText(next.listButtonText || "📋 Buka Pilihan");
    setSectionTitle(next.sectionTitle || "Pilihan");
    setError("");
  };

  // Seed a sensible confirmation composer the first time the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    if (buttons.length === 0 && rows.length === 0 && !body) {
      resetTo({
        mode: "buttons",
        title: "Konfirmasi",
        body: `Halo ${displayName}, apakah Anda ingin melanjutkan pesanan ini?`,
        footer: "Pilih salah satu tombol di bawah",
        buttons: [
          { key: uid(), type: "quick_reply", label: "✅ Ya, Lanjutkan", value: "confirm_yes" },
          { key: uid(), type: "quick_reply", label: "❌ Batalkan", value: "confirm_no" },
          { key: uid(), type: "quick_reply", label: "💬 Tanya CS", value: "ask_cs" },
        ],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Load stock once so the "Menu dari stok" preset can use real products.
  useEffect(() => {
    if (!isOpen) return;
    apiFetch("/api/conversations/stock-menu")
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data) => setStockItems(Array.isArray(data.items) ? data.items : []))
      .catch(() => setStockItems([]));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose]);

  const stockRows = useMemo<MenuRow[]>(
    () =>
      stockItems.slice(0, 10).map((item) => ({
        key: uid(),
        title: item.name,
        description: [item.priceLabel, item.stockLabel].filter(Boolean).join(" • "),
      })),
    [stockItems]
  );

  const presets = [
    {
      id: "confirm",
      label: "Konfirmasi",
      desc: "Ya / Batalkan / Tanya CS",
      icon: CheckCircle2,
      apply: () =>
        resetTo({
          mode: "buttons",
          title: "Konfirmasi",
          body: `Halo ${displayName}, apakah Anda ingin melanjutkan pesanan ini?`,
          footer: "Pilih salah satu tombol di bawah",
          buttons: [
            { key: uid(), type: "quick_reply", label: "✅ Ya, Lanjutkan", value: "confirm_yes" },
            { key: uid(), type: "quick_reply", label: "❌ Batalkan", value: "confirm_no" },
            { key: uid(), type: "quick_reply", label: "💬 Tanya CS", value: "ask_cs" },
          ],
        }),
    },
    {
      id: "offer",
      label: "Penawaran",
      desc: "Link + kode promo",
      icon: Tag,
      apply: () =>
        resetTo({
          mode: "buttons",
          title: "Penawaran Spesial 🎉",
          body: "Ada penawaran spesial untuk Anda hari ini. Tekan tombol di bawah untuk melihat detailnya.",
          footer: "Penawaran terbatas",
          buttons: [
            { key: uid(), type: "cta_url", label: "🌐 Lihat Penawaran", value: "https://" },
            { key: uid(), type: "cta_copy", label: "📋 Salin Kode Promo", value: "PROMO10" },
            { key: uid(), type: "quick_reply", label: "💬 Saya Tertarik", value: "offer_interested" },
          ],
        }),
    },
    {
      id: "menu-stock",
      label: "Menu dari Stok",
      desc: stockItems.length > 0 ? `${stockItems.length} produk tersedia` : "Belum ada data stok",
      icon: Package,
      apply: () =>
        resetTo({
          mode: "list",
          title: "Katalog Produk",
          body: "Silakan pilih produk yang ingin Anda lihat atau pesan:",
          footer: "Harga dan stok dapat berubah",
          listButtonText: "📋 Lihat Produk",
          sectionTitle: "Produk Tersedia",
          rows:
            stockRows.length > 0
              ? stockRows
              : [{ key: uid(), title: "Produk A", description: "Tambahkan produk dari data stok" }],
        }),
    },
    {
      id: "menu-services",
      label: "Menu Layanan",
      desc: "Daftar pilihan umum",
      icon: UtensilsCrossed,
      apply: () =>
        resetTo({
          mode: "list",
          title: "Menu Layanan",
          body: "Silakan pilih layanan yang ingin Anda ketahui lebih lanjut:",
          footer: "Pilih dari daftar menu",
          listButtonText: "📋 Buka Menu",
          sectionTitle: "Layanan",
          rows: [
            { key: uid(), title: "Informasi Produk", description: "Detail harga dan ketersediaan" },
            { key: uid(), title: "Cara Pemesanan", description: "Langkah pemesanan dan pembayaran" },
            { key: uid(), title: "Bicara dengan CS", description: "Terhubung dengan tim kami" },
          ],
        }),
    },
    {
      id: "followup",
      label: "Follow-up",
      desc: "Cek status / tawaran bantu",
      icon: MessageSquare,
      apply: () =>
        resetTo({
          mode: "buttons",
          title: "Follow-up",
          body: `Halo ${displayName}, apakah ada yang bisa kami bantu lagi?`,
          footer: "Kami siap membantu",
          buttons: [
            { key: uid(), type: "quick_reply", label: "✅ Sudah Cukup", value: "done" },
            { key: uid(), type: "quick_reply", label: "💬 Masih Ada Pertanyaan", value: "more_question" },
            { key: uid(), type: "quick_reply", label: "📞 Hubungi Saya", value: "call_me" },
          ],
        }),
    },
  ];

  const addButton = () => {
    if (buttons.length >= 10) return;
    setButtons((prev) => [
      ...prev,
      { key: uid(), type: "quick_reply", label: `Pilihan ${prev.length + 1}`, value: `option_${prev.length + 1}` },
    ]);
  };

  const updateButton = (key: string, patch: Partial<ButtonItem>) => {
    setButtons((prev) =>
      prev.map((b) => {
        if (b.key !== key) return b;
        const next = { ...b, ...patch };
        if (patch.type && patch.type !== b.type) {
          // Reset the value to a sensible default for the new button type so a
          // stale URL/phone never leaks into a quick reply (or vice versa).
          if (patch.type === "cta_url") next.value = "https://";
          else if (patch.type === "cta_call") next.value = "+62";
          else next.value = "";
        }
        return next;
      })
    );
  };

  const addRow = () => {
    if (rows.length >= 10) return;
    setRows((prev) => [...prev, { key: uid(), title: `Pilihan ${prev.length + 1}`, description: "" }]);
  };

  const updateRow = (key: string, patch: Partial<MenuRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const buildPayload = () => {
    if (mode === "buttons") {
      const clean = buttons.filter((b) => b.label.trim());
      if (clean.length === 0) throw new Error("Tambahkan minimal satu tombol.");
      return {
        title: title.trim(),
        body: body.trim(),
        footer: footer.trim(),
        buttons: clean.map((b) => {
          if (b.type === "cta_url") {
            if (!/^https?:\/\//.test(b.value)) throw new Error(`Link tombol "${b.label}" harus diawali http:// atau https://`);
            return { type: b.type, displayText: b.label.trim(), url: b.value.trim() };
          }
          if (b.type === "cta_call") {
            if (!b.value.trim()) throw new Error(`Nomor telepon tombol "${b.label}" belum diisi.`);
            return { type: b.type, displayText: b.label.trim(), phoneNumber: b.value.trim() };
          }
          if (b.type === "cta_copy") {
            return { type: b.type, displayText: b.label.trim(), copyCode: b.value.trim() || b.label.trim() };
          }
          return { type: b.type, displayText: b.label.trim(), id: b.value.trim() || b.label.trim() };
        }),
      };
    }

    const cleanRows = rows.filter((r) => r.title.trim());
    if (cleanRows.length === 0) throw new Error("Tambahkan minimal satu pilihan pada daftar.");
    return {
      title: title.trim(),
      body: body.trim(),
      footer: footer.trim(),
      buttons: [
        {
          type: "single_select",
          title: listButtonText.trim() || "Lihat Pilihan",
          sections: [
            {
              title: sectionTitle.trim() || "Pilihan",
              rows: cleanRows.map((r, i) => ({
                id: `row_${i + 1}`,
                title: r.title.trim(),
                description: r.description.trim(),
              })),
            },
          ],
        },
      ],
    };
  };

  const handleSend = async () => {
    if (sending) return;
    setError("");

    if (!body.trim() && !title.trim()) {
      setError("Isi pesan tidak boleh kosong.");
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = buildPayload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payload tidak valid.");
      return;
    }

    setSending(true);
    try {
      const res = await apiFetch(
        `/api/conversations/${conversationId}/interactive`,
        { method: "POST", body: JSON.stringify(payload) },
        30000
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Gagal mengirim pesan interaktif.");
      }
      onSent?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim pesan interaktif.");
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kirim pesan interaktif"
        className="relative flex w-full max-w-3xl max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl animate-scaleUp"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Sparkles size={17} className="text-amber-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-100">Pesan Interaktif</h2>
              <p className="text-[11px] text-slate-500 truncate">
                Kirim tombol / menu ke {customerName || "pelanggan"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Presets */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Template Cepat
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {presets.map((preset) => {
                const Icon = preset.icon;
                return (
                  <button
                    key={preset.id}
                    onClick={preset.apply}
                    className="text-left rounded-xl border border-slate-800 bg-slate-950/60 p-3 hover:border-amber-500/40 hover:bg-amber-500/5 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={14} className="text-amber-400 shrink-0" />
                      <span className="text-xs font-semibold text-slate-200 group-hover:text-amber-300">
                        {preset.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-snug">{preset.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mode switch */}
          <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-950 border border-slate-800 w-max">
            <button
              onClick={() => setMode("buttons")}
              className={
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer " +
                (mode === "buttons" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200")
              }
            >
              <MousePointerClick size={13} />
              Tombol
            </button>
            <button
              onClick={() => setMode("list")}
              className={
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer " +
                (mode === "list" ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200")
              }
            >
              <ListFilter size={13} />
              Daftar
            </button>
          </div>

          {/* Message fields */}
          <div className="grid gap-3">
            <div>
              <label className={labelClass}>Judul (opsional)</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Contoh: Konfirmasi Pesanan" />
            </div>
            <div>
              <label className={labelClass}>Isi Pesan</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                autoFocus
                className={inputClass + " resize-none"}
                placeholder="Tulis pesan yang akan dibaca pelanggan..."
              />
            </div>
            <div>
              <label className={labelClass}>Catatan Kaki (opsional)</label>
              <input value={footer} onChange={(e) => setFooter(e.target.value)} className={inputClass} placeholder="Contoh: Penawaran terbatas" />
            </div>
          </div>

          {/* Buttons builder */}
          {mode === "buttons" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Tombol ({buttons.length}/10)
                </p>
                <button
                  onClick={addButton}
                  disabled={buttons.length >= 10}
                  className="flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <Plus size={12} />
                  Tambah
                </button>
              </div>

              {buttons.map((button) => (
                <div key={button.key} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={button.type}
                      onChange={(e) => updateButton(button.key, { type: e.target.value as ButtonType })}
                      className="rounded-lg bg-slate-900 border border-slate-700 px-2 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-amber-500/50"
                    >
                      {(Object.keys(BUTTON_TYPE_LABEL) as ButtonType[]).map((type) => (
                        <option key={type} value={type}>
                          {BUTTON_TYPE_LABEL[type]}
                        </option>
                      ))}
                    </select>
                    <input
                      value={button.label}
                      onChange={(e) => updateButton(button.key, { label: e.target.value })}
                      className={inputClass + " flex-1"}
                      placeholder="Teks tombol"
                    />
                    <button
                      onClick={() => setButtons((prev) => prev.filter((b) => b.key !== button.key))}
                      aria-label="Hapus tombol"
                      className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 shrink-0">
                      {button.type === "cta_url" ? (
                        <ExternalLink size={13} />
                      ) : button.type === "cta_call" ? (
                        <Phone size={13} />
                      ) : button.type === "cta_copy" ? (
                        <Copy size={13} />
                      ) : (
                        <MessageSquare size={13} />
                      )}
                    </span>
                    <input
                      value={button.value}
                      onChange={(e) => updateButton(button.key, { value: e.target.value })}
                      className={inputClass + " flex-1 text-xs"}
                      placeholder={
                        button.type === "cta_url"
                          ? "https://contoh.com"
                          : button.type === "cta_call"
                          ? "+628123456789"
                          : button.type === "cta_copy"
                          ? "Kode / teks yang disalin"
                          : "Nilai balasan (opsional)"
                      }
                    />
                  </div>
                </div>
              ))}

              {buttons.length === 0 && (
                <p className="text-[11px] text-slate-500 text-center py-3">
                  Belum ada tombol. Tambahkan minimal satu.
                </p>
              )}
            </div>
          )}

          {/* List builder */}
          {mode === "list" && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Teks Tombol Daftar</label>
                  <input value={listButtonText} onChange={(e) => setListButtonText(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Judul Bagian</label>
                  <input value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Pilihan ({rows.length}/10)
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (stockRows.length === 0) {
                        setError("Belum ada data stok untuk diisi.");
                        return;
                      }
                      setRows(stockRows);
                      setError("");
                    }}
                    className="flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Package size={12} />
                    Isi dari Stok
                  </button>
                  <button
                    onClick={addRow}
                    disabled={rows.length >= 10}
                    className="flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <Plus size={12} />
                    Tambah
                  </button>
                </div>
              </div>

              {rows.map((row) => (
                <div key={row.key} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={row.title}
                      onChange={(e) => updateRow(row.key, { title: e.target.value })}
                      className={inputClass + " flex-1"}
                      placeholder="Nama pilihan"
                    />
                    <button
                      onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                      aria-label="Hapus pilihan"
                      className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <input
                    value={row.description}
                    onChange={(e) => updateRow(row.key, { description: e.target.value })}
                    className={inputClass + " text-xs"}
                    placeholder="Deskripsi singkat (opsional)"
                  />
                </div>
              ))}

              {rows.length === 0 && (
                <p className="text-[11px] text-slate-500 text-center py-3">
                  Belum ada pilihan. Tambahkan manual atau isi dari stok.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-800 px-5 py-3 shrink-0">
          {error && (
            <p className="mb-2 text-[11px] text-rose-400 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-rose-400" />
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] text-slate-500 hidden sm:block">
              Tombol akan tampil native di WhatsApp pelanggan.
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {sending ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-700 border-t-slate-950 animate-spin" />
                ) : (
                  <Send size={13} />
                )}
                {sending ? "Mengirim..." : "Kirim"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
