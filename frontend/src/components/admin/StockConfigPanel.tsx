"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import Modal from "@/components/Modal";
import { Toggle } from "@/components/ui";
import {
  Package,
  Save,
  Eye,
  RefreshCw,
  FlaskConical,
  ChevronDown,
  ChevronUp,
  Sheet,
  Database,
  Server,
  Info,
  Lock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

type SourceType = "google_sheets" | "mysql" | "postgresql";

interface StockFields {
  spreadsheetId: string;
  sheetName: string;
  headerRow: number;
  colName: string;
  colPrice: string;
  colStock: string;
  credentialsPath: string;
  credentialsJson: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  table: string;
  colQty: string;
}

interface StockStatus {
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  last_item_count: number;
  runtime?: {
    status: string;
    lastSyncedAt: string | null;
    lastError: string | null;
    itemCount: number;
    sourceType: string | null;
  };
}

interface PreviewItem {
  name: string;
  price: number | null;
  stock: number | null;
  priceLabel: string;
  stockLabel: string;
}

const DEFAULT_FIELDS: StockFields = {
  spreadsheetId: "",
  sheetName: "Sheet1",
  headerRow: 1,
  colName: "A",
  colPrice: "B",
  colStock: "C",
  credentialsPath: "",
  credentialsJson: "",
  host: "",
  port: 3306,
  database: "",
  user: "",
  password: "",
  table: "",
  colQty: "stok",
};

const inputClass =
  "w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all";

const labelClass = "block text-xs font-medium text-slate-400 mb-1.5";
const hintClass = "text-[10px] text-slate-500 mt-1 leading-relaxed";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
      {hint && <p className={hintClass}>{hint}</p>}
    </div>
  );
}

export default function StockConfigPanel() {
  const [sourceType, setSourceType] = useState<SourceType>("google_sheets");
  const [isActive, setIsActive] = useState(false);
  const [fields, setFields] = useState<StockFields>(DEFAULT_FIELDS);
  const [advanced, setAdvanced] = useState(false);
  const [configJson, setConfigJson] = useState("{}");
  const [jsonError, setJsonError] = useState("");

  const [status, setStatus] = useState<StockStatus | null>(null);
  const [preview, setPreview] = useState<PreviewItem[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "warning" | "info";
  }>({ isOpen: false, title: "", message: "", type: "info" });

  const showModal = (title: string, message: string, type: "success" | "error" | "warning" | "info") =>
    setModal({ isOpen: true, title, message, type });

  const load = async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await apiFetch("/api/admin/stock-config", {}, 20000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat konfigurasi stok");

      setSourceType((data.source_type as SourceType) || "google_sheets");
      setIsActive(Boolean(data.is_active));
      setFields({ ...DEFAULT_FIELDS, ...(data.fields || {}) });
      setConfigJson(JSON.stringify(data.config || {}, null, 2));
      setStatus(data.status || null);
    } catch (err) {
      showModal("Error", err instanceof Error ? err.message : "Gagal memuat konfigurasi stok", "error");
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = <K extends keyof StockFields>(key: K, value: StockFields[K]) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const changeSource = (next: SourceType) => {
    setSourceType(next);
    if (next === "postgresql" && fields.port === 3306) setField("port", 5432);
    if (next === "mysql" && fields.port === 5432) setField("port", 3306);
  };

  const buildBody = () => {
    if (advanced) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(configJson);
      } catch {
        setJsonError("JSON tidak valid. Periksa kembali formatnya.");
        throw new Error("JSON tidak valid.");
      }
      setJsonError("");
      return { source_type: sourceType, is_active: isActive, config_json: parsed };
    }
    return { source_type: sourceType, is_active: isActive, fields };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = buildBody();
      const res = await apiFetch(
        "/api/admin/stock-config",
        { method: "PUT", body: JSON.stringify(body) },
        45000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan konfigurasi stok");

      setFields({ ...DEFAULT_FIELDS, ...(data.fields || {}) });
      setConfigJson(JSON.stringify(data.config || {}, null, 2));
      setStatus(data.status || null);

      const runtime = data.status?.runtime;
      if (runtime?.status === "error") {
        showModal(
          "Tersimpan, tetapi sync gagal",
          runtime.lastError || data.status?.last_sync_error || "Periksa kembali konfigurasi dan koneksi.",
          "warning"
        );
      } else {
        showModal("Berhasil", "Konfigurasi stok berhasil disimpan dan disinkronkan.", "success");
      }
    } catch (err) {
      showModal("Error", err instanceof Error ? err.message : "Gagal menyimpan konfigurasi stok", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const body = buildBody();
      const res = await apiFetch(
        "/api/admin/stock-config/test",
        { method: "POST", body: JSON.stringify(body) },
        45000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menguji koneksi");

      if (data.ok) {
        const sample = Array.isArray(data.sample)
          ? data.sample.map((s: PreviewItem) => s.name).slice(0, 3).join(", ")
          : "";
        showModal(
          "Koneksi Berhasil",
          `Ditemukan ${data.count} baris data.${sample ? ` Contoh: ${sample}.` : ""}`,
          "success"
        );
      } else {
        showModal("Koneksi Gagal", data.error || "Tidak dapat terhubung ke sumber data.", "error");
      }
    } catch (err) {
      showModal("Koneksi Gagal", err instanceof Error ? err.message : "Gagal menguji koneksi", "error");
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch("/api/admin/stock-config/sync", { method: "POST" }, 45000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyinkronkan stok");

      await load();
      if (data.success) {
        showModal("Sinkronisasi Berhasil", `${data.count} produk berhasil dimuat.`, "success");
      } else {
        showModal(
          "Sinkronisasi Gagal",
          data.status?.lastError || "Periksa konfigurasi dan koneksi sumber data.",
          "error"
        );
      }
    } catch (err) {
      showModal("Error", err instanceof Error ? err.message : "Gagal menyinkronkan stok", "error");
    } finally {
      setSyncing(false);
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await apiFetch("/api/admin/stock/preview", {}, 45000);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat preview stok");
      setPreview(Array.isArray(data) ? data : []);
    } catch (err) {
      showModal("Error", err instanceof Error ? err.message : "Gagal memuat preview stok", "error");
    } finally {
      setPreviewLoading(false);
    }
  };

  const runtimeStatus = status?.runtime?.status || status?.last_sync_status || "idle";
  const lastSynced = status?.runtime?.lastSyncedAt || status?.last_synced_at || null;
  const itemCount = status?.runtime?.itemCount ?? status?.last_item_count ?? 0;
  const lastError = status?.runtime?.lastError || status?.last_sync_error || null;

  const statusBadge = () => {
    if (runtimeStatus === "success") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-400">
          <CheckCircle2 size={12} /> Tersinkron
        </span>
      );
    }
    if (runtimeStatus === "error") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-400">
          <AlertCircle size={12} /> Gagal sync
        </span>
      );
    }
    if (runtimeStatus === "syncing") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-400">
          <RefreshCw size={12} className="animate-spin" /> Menyinkronkan
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-600/40 bg-slate-500/10 px-2 py-1 text-[11px] font-semibold text-slate-400">
        <Info size={12} /> Belum aktif
      </span>
    );
  };

  const stockBadgeClass = (item: PreviewItem) => {
    if (item.stock === null) return "bg-slate-500/10 text-slate-400 border-slate-600/30";
    if (item.stock <= 0) return "bg-rose-500/10 text-rose-400 border-rose-500/30";
    if (item.stock <= 5) return "bg-amber-500/10 text-amber-400 border-amber-500/30";
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-amber-500 animate-spin" />
          <span className="text-sm">Memuat konfigurasi stok...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl animate-fadeIn">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <Package size={16} className="text-amber-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Integrasi Stok</h2>
          <p className="text-xs text-slate-500">
            Hubungkan data produk agar bot bisa menjawab stok dan harga secara otomatis
          </p>
        </div>
      </div>

      {/* Status summary */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg bg-slate-950/60 border border-slate-800/60 p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Status</p>
            {statusBadge()}
          </div>
          <div className="rounded-lg bg-slate-950/60 border border-slate-800/60 p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Terakhir Sync</p>
            <p className="text-sm font-medium text-slate-200">
              {lastSynced ? timeAgo(lastSynced) : "Belum pernah"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-950/60 border border-slate-800/60 p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Jumlah Produk</p>
            <p className="text-sm font-medium text-slate-200">{itemCount} produk</p>
          </div>
        </div>
        {lastError && (
          <p className="mt-3 text-[11px] text-rose-400 flex items-start gap-1.5">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>{lastError}</span>
          </p>
        )}
      </div>

      {/* Source type cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        {[
          {
            id: "google_sheets" as SourceType,
            label: "Google Sheets",
            desc: "Paling mudah, cukup spreadsheet",
            icon: Sheet,
          },
          {
            id: "mysql" as SourceType,
            label: "MySQL",
            desc: "Database toko / ERP",
            icon: Database,
          },
          {
            id: "postgresql" as SourceType,
            label: "PostgreSQL",
            desc: "Database toko / ERP",
            icon: Server,
          },
        ].map((source) => {
          const Icon = source.icon;
          const active = sourceType === source.id;
          return (
            <button
              key={source.id}
              onClick={() => changeSource(source.id)}
              className={
                "text-left rounded-xl border p-3 transition-colors cursor-pointer " +
                (active
                  ? "border-amber-500/50 bg-amber-500/10"
                  : "border-slate-800 bg-slate-900 hover:border-slate-700")
              }
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon size={15} className={active ? "text-amber-400" : "text-slate-400"} />
                <span className={"text-xs font-semibold " + (active ? "text-amber-300" : "text-slate-200")}>
                  {source.label}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-snug">{source.desc}</p>
            </button>
          );
        })}
      </div>

      {/* Configuration form */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        {sourceType === "google_sheets" ? (
          <>
            <Field
              label="Link atau ID Spreadsheet"
              hint="Tempel URL lengkap Google Sheets, atau cukup ID-nya."
            >
              <input
                value={fields.spreadsheetId}
                onChange={(e) => setField("spreadsheetId", e.target.value)}
                className={inputClass}
                placeholder="https://docs.google.com/spreadsheets/d/..."
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Nama Sheet">
                <input
                  value={fields.sheetName}
                  onChange={(e) => setField("sheetName", e.target.value)}
                  className={inputClass}
                  placeholder="Sheet1"
                />
              </Field>
              <Field label="Baris Header" hint="Baris judul kolom (biasanya 1).">
                <input
                  type="number"
                  min={1}
                  value={fields.headerRow}
                  onChange={(e) => setField("headerRow", Number(e.target.value) || 1)}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Kolom Nama">
                <input
                  value={fields.colName}
                  onChange={(e) => setField("colName", e.target.value.toUpperCase())}
                  className={inputClass}
                  placeholder="A"
                />
              </Field>
              <Field label="Kolom Harga">
                <input
                  value={fields.colPrice}
                  onChange={(e) => setField("colPrice", e.target.value.toUpperCase())}
                  className={inputClass}
                  placeholder="B"
                />
              </Field>
              <Field label="Kolom Stok">
                <input
                  value={fields.colStock}
                  onChange={(e) => setField("colStock", e.target.value.toUpperCase())}
                  className={inputClass}
                  placeholder="C"
                />
              </Field>
            </div>

            <div className="rounded-lg border border-slate-800/70 bg-slate-950/50 p-3 space-y-3">
              <div className="flex items-start gap-2">
                <Lock size={13} className="text-slate-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Buat <span className="text-slate-300">Service Account</span> di Google Cloud, aktifkan
                  Google Sheets API, lalu bagikan spreadsheet ke email service account (Viewer).
                  Kredensial bisa ditempel langsung di bawah — tidak wajib menyimpan file.
                </p>
              </div>

              <Field
                label="Path File Service Account (opsional)"
                hint="Contoh: backend/credentials/service-account.json"
              >
                <input
                  value={fields.credentialsPath}
                  onChange={(e) => setField("credentialsPath", e.target.value)}
                  className={inputClass}
                  placeholder="credentials/service-account.json"
                />
              </Field>

              <Field
                label="Atau Tempel JSON Service Account"
                hint="Kosongkan jika kredensial sudah tersimpan. Nilai sensitif tidak akan ditampilkan kembali."
              >
                <textarea
                  value={fields.credentialsJson}
                  onChange={(e) => setField("credentialsJson", e.target.value)}
                  rows={5}
                  className={inputClass + " font-mono text-xs resize-none"}
                  placeholder='{ "type": "service_account", "project_id": "...", ... }'
                />
              </Field>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Host">
                  <input
                    value={fields.host}
                    onChange={(e) => setField("host", e.target.value)}
                    className={inputClass}
                    placeholder="127.0.0.1 atau db.contoh.com"
                  />
                </Field>
              </div>
              <Field label="Port">
                <input
                  type="number"
                  value={fields.port}
                  onChange={(e) => setField("port", Number(e.target.value) || (sourceType === "mysql" ? 3306 : 5432))}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Nama Database">
                <input
                  value={fields.database}
                  onChange={(e) => setField("database", e.target.value)}
                  className={inputClass}
                  placeholder="stok_db"
                />
              </Field>
              <Field label="Tabel Produk">
                <input
                  value={fields.table}
                  onChange={(e) => setField("table", e.target.value)}
                  className={inputClass}
                  placeholder="products"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Username">
                <input
                  value={fields.user}
                  onChange={(e) => setField("user", e.target.value)}
                  className={inputClass}
                  placeholder="readonly_user"
                />
              </Field>
              <Field
                label="Password"
                hint="Kosongkan jika tidak ingin mengubah password yang tersimpan."
              >
                <input
                  type="password"
                  value={fields.password}
                  onChange={(e) => setField("password", e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Kolom Nama">
                <input
                  value={fields.colName}
                  onChange={(e) => setField("colName", e.target.value)}
                  className={inputClass}
                  placeholder="nama_produk"
                />
              </Field>
              <Field label="Kolom Stok">
                <input
                  value={fields.colQty}
                  onChange={(e) => setField("colQty", e.target.value)}
                  className={inputClass}
                  placeholder="stok"
                />
              </Field>
              <Field label="Kolom Harga">
                <input
                  value={fields.colPrice}
                  onChange={(e) => setField("colPrice", e.target.value)}
                  className={inputClass}
                  placeholder="harga"
                />
              </Field>
            </div>

            <p className="text-[10px] text-slate-500 flex items-start gap-1.5">
              <Info size={12} className="mt-0.5 shrink-0" />
              Gunakan user database <span className="text-amber-400">read-only</span> agar kredensial
              tidak bisa mengubah data toko.
            </p>
          </>
        )}

        {/* Advanced JSON */}
        <div className="border-t border-slate-800 pt-3">
          <button
            onClick={() => setAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            {advanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Mode lanjutan (JSON)
          </button>
          {advanced && (
            <div className="mt-3">
              <textarea
                value={configJson}
                onChange={(e) => {
                  setConfigJson(e.target.value);
                  setJsonError("");
                }}
                rows={9}
                className={inputClass + " font-mono text-xs resize-none"}
              />
              <p className="text-[10px] text-slate-500 mt-1.5">
                Saat mode ini terbuka, isi JSON di atas yang dipakai ketika menyimpan/menguji.
                Form di atas diabaikan.
              </p>
              {jsonError && <p className="text-[11px] text-rose-400 mt-1.5">{jsonError}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1 border-t border-slate-800">
          <label className="text-xs font-medium text-slate-400">Aktifkan Sinkronisasi Stok</label>
          <Toggle checked={isActive} onChange={setIsActive} label="Aktifkan sinkronisasi stok" />
          <span className={"text-[11px] font-medium " + (isActive ? "text-emerald-400" : "text-slate-500")}>
            {isActive ? "Aktif" : "Nonaktif"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {saving ? (
            <span className="w-4 h-4 rounded-full border-2 border-slate-700 border-t-slate-950 animate-spin" />
          ) : (
            <Save size={15} />
          )}
          {saving ? "Menyimpan..." : "Simpan"}
        </button>

        <button
          onClick={handleTest}
          disabled={testing}
          className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {testing ? (
            <span className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-amber-500 animate-spin" />
          ) : (
            <FlaskConical size={15} />
          )}
          {testing ? "Menguji..." : "Tes Koneksi"}
        </button>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
          {syncing ? "Sinkron..." : "Sinkron Sekarang"}
        </button>

        <button
          onClick={handlePreview}
          disabled={previewLoading}
          className="flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Eye size={15} />
          {previewLoading ? "Memuat..." : "Preview"}
        </button>
      </div>

      {/* Preview */}
      {preview && preview.length > 0 && (
        <div className="mt-5 rounded-xl border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-300">Preview Data Stok</p>
            <span className="text-[10px] text-slate-500">{preview.length} produk</span>
          </div>
          <div className="max-h-[45vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-950">
                <tr className="border-b border-slate-800">
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Nama Produk</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Harga</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Stok</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((item, i) => (
                  <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-950/50 transition-colors">
                    <td className="px-4 py-2.5 text-slate-200">{item.name}</td>
                    <td className="px-4 py-2.5 text-slate-300">{item.priceLabel || "-"}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold " +
                          stockBadgeClass(item)
                        }
                      >
                        {item.stockLabel || "-"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {preview && preview.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-4">
          Tidak ada data stok. Periksa konfigurasi lalu klik Sinkron Sekarang.
        </p>
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
