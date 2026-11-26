import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger.js";
import fs from "fs/promises";
import path from "path";
import dns from "dns/promises";
import net from "net";

const stockCache = new Map<string, Record<string, unknown>>();
let syncTimer: ReturnType<typeof setInterval> | null = null;
const SYNC_INTERVAL_MS = 60_000; // 60 seconds

export type StockSourceType = "google_sheets" | "mysql" | "postgresql";

export interface StockItem {
  name: string;
  price: number | null;
  stock: number | null;
  priceLabel: string;
  stockLabel: string;
  raw: Record<string, unknown>;
}

export interface StockSyncState {
  status: "idle" | "syncing" | "success" | "error";
  lastSyncedAt: string | null;
  lastError: string | null;
  itemCount: number;
  durationMs: number | null;
  sourceType: string | null;
}

const initialSyncState: StockSyncState = {
  status: "idle",
  lastSyncedAt: null,
  lastError: null,
  itemCount: 0,
  durationMs: null,
  sourceType: null,
};

let syncState: StockSyncState = { ...initialSyncState };
let syncInFlight: Promise<void> | null = null;

// ── SSRF guard ───────────────────────────────────────────────
// The stock connector dials an admin-supplied host:port. Even though the route
// is super_admin-only, we block the cloud metadata service and link-local range
// (the classic SSRF escalation target) as defense in depth. Private LAN ranges
// are intentionally NOT blocked — self-hosted databases on a Docker/VPC network
// are a legitimate, expected configuration here.
function isBlockedIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    // 169.254.0.0/16 link-local (includes 169.254.169.254 metadata endpoint)
    if (ip.startsWith("169.254.")) return true;
    // 0.0.0.0/8 "this host" range
    if (ip.startsWith("0.")) return true;
  } else if (v === 6) {
    const lower = ip.toLowerCase();
    // fe80::/10 link-local, and IPv4-mapped link-local (::ffff:169.254.x.x)
    if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
      return true;
    }
    if (lower.includes("169.254.")) return true;
    // fd00::/8 / fc00::/7 unique-local metadata variants left allowed (private LAN)
  }
  return false;
}

// Resolve the host and reject if ANY resolved address is blocked. Resolving
// up-front also narrows DNS-rebinding (a name that resolves to a benign IP then
// flips to 169.254.169.254) since we validate the addresses we will dial.
async function assertHostAllowed(host: string): Promise<void> {
  if (!host || typeof host !== "string") {
    throw new Error("[stock] Missing database host");
  }
  let addresses: string[];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      const records = await dns.lookup(host, { all: true });
      addresses = records.map((r) => r.address);
    } catch {
      throw new Error(`[stock] Cannot resolve host: ${host}`);
    }
  }
  for (const addr of addresses) {
    if (isBlockedIp(addr)) {
      throw new Error(`[stock] Blocked connection to restricted address (${addr})`);
    }
  }
}

/* ─────────────────────────────  Config helpers  ───────────────────────────── */

const SECRET_KEYS = ["password", "credentials_json", "api_key", "apikey", "secret", "token"];

export function parseStockConfigJson(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export function maskStockConfig(config: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = { ...config };
  for (const key of Object.keys(masked)) {
    if (SECRET_KEYS.includes(key.toLowerCase()) && masked[key]) {
      masked[key] = "***";
    }
  }
  return masked;
}

/**
 * Merge a newly submitted config over the existing one while preserving
 * secrets that the UI only shows masked (`***`) or left blank. Without this a
 * save from the panel would overwrite the real password with "***".
 */
export function mergeStockConfig(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...existing, ...incoming };
  for (const key of Object.keys(incoming)) {
    const value = incoming[key];
    if (
      SECRET_KEYS.includes(key.toLowerCase()) &&
      (value === "" || value === "***" || value === null || value === undefined)
    ) {
      merged[key] = existing[key];
    }
  }
  return merged;
}

/** Extract a spreadsheet ID from a full Google Sheets URL (or pass the ID through). */
export function extractSpreadsheetId(input: string): string {
  const value = (input || "").trim();
  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : value;
}

function pick(fields: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (fields[key] !== undefined && fields[key] !== null && fields[key] !== "") {
      return fields[key];
    }
  }
  return undefined;
}

/**
 * Build the internal config_json from the friendly form fields the admin panel
 * submits. Both camelCase (UI) and snake_case (API) keys are accepted.
 */
export function buildConfigFromFields(
  sourceType: StockSourceType,
  fields: Record<string, unknown>
): Record<string, unknown> {
  if (sourceType === "google_sheets") {
    const spreadsheetRaw = String(
      pick(fields, "spreadsheetId", "spreadsheet_id", "spreadsheetUrl", "spreadsheet_url") || ""
    );
    const columnsInput = fields.columns as Record<string, unknown> | undefined;

    const config: Record<string, unknown> = {
      spreadsheet_id: extractSpreadsheetId(spreadsheetRaw),
      sheet_name: String(pick(fields, "sheetName", "sheet_name") || "Sheet1"),
      header_row: Number(pick(fields, "headerRow", "header_row")) || 1,
      columns: {
        name: String(
          columnsInput?.name || pick(fields, "colName", "col_name", "nameColumn") || "A"
        ).toUpperCase(),
        price: String(
          columnsInput?.price || pick(fields, "colPrice", "col_price", "priceColumn") || "B"
        ).toUpperCase(),
        stock: String(
          columnsInput?.stock || pick(fields, "colStock", "col_stock", "stockColumn") || "C"
        ).toUpperCase(),
      },
    };

    const credentialsPath = pick(fields, "credentialsPath", "credentials_path");
    if (credentialsPath) config.credentials_path = String(credentialsPath);

    const credentialsJson = pick(fields, "credentialsJson", "credentials_json");
    if (credentialsJson) {
      if (typeof credentialsJson === "string") {
        const trimmed = credentialsJson.trim();
        if (trimmed) {
          try {
            config.credentials_json = JSON.parse(trimmed);
          } catch {
            // Keep the raw string; fetch will surface a clear error.
            config.credentials_json = trimmed;
          }
        }
      } else {
        config.credentials_json = credentialsJson;
      }
    }

    return config;
  }

  const defaultPort = sourceType === "mysql" ? 3306 : 5432;
  return {
    host: String(pick(fields, "host") || ""),
    port: Number(pick(fields, "port")) || defaultPort,
    database: String(pick(fields, "database", "db") || ""),
    user: String(pick(fields, "user", "username") || ""),
    password: pick(fields, "password") !== undefined ? String(pick(fields, "password")) : "",
    table: String(pick(fields, "table") || ""),
    col_name: String(pick(fields, "colName", "col_name") || "nama_produk"),
    col_qty: String(pick(fields, "colQty", "col_qty") || "stok"),
    col_price: String(pick(fields, "colPrice", "col_price") || "harga"),
  };
}

/** Flatten an internal config into the friendly fields the admin panel edits. */
export function configToFriendlyFields(
  sourceType: StockSourceType | null,
  config: Record<string, unknown>
): Record<string, unknown> {
  if (sourceType === "google_sheets") {
    const columns = (config.columns as Record<string, unknown>) || {};
    return {
      spreadsheetId: config.spreadsheet_id || "",
      sheetName: config.sheet_name || "Sheet1",
      headerRow: config.header_row || 1,
      colName: columns.name || "A",
      colPrice: columns.price || "B",
      colStock: columns.stock || "C",
      credentialsPath: config.credentials_path || "",
      credentialsJson: "",
    };
  }

  return {
    host: config.host || "",
    port: config.port || (sourceType === "postgresql" ? 5432 : 3306),
    database: config.database || "",
    user: config.user || "",
    password: "",
    table: config.table || "",
    colName: config.col_name || "nama_produk",
    colQty: config.col_qty || "stok",
    colPrice: config.col_price || "harga",
  };
}

/* ─────────────────────────────  Normalization  ───────────────────────────── */

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const raw = String(value).trim().replace(/[^0-9.,-]/g, "");
  if (!raw) return null;

  let normalized = raw;
  if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  } else if (/^-?\d{1,3}(,\d{3})+$/.test(raw)) {
    normalized = raw.replace(/,/g, "");
  } else {
    normalized = raw.replace(",", ".");
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function formatRupiah(value: number | null): string {
  if (value === null) return "";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function stockLabel(value: number | null): string {
  if (value === null) return "";
  if (value <= 0) return "habis";
  if (value <= 5) return `stok terbatas (${value})`;
  return `tersedia (${value})`;
}

export function normalizeStockItem(raw: Record<string, unknown>): StockItem {
  const name = String(
    raw.name ?? raw.nama_produk ?? raw.product ?? raw.produk ?? raw.title ?? "unknown"
  ).trim();
  const price = toNumber(raw.harga ?? raw.price ?? raw.unit_price ?? raw.harga_jual);
  const stock = toNumber(raw.stok ?? raw.stock ?? raw.qty ?? raw.quantity ?? raw.jumlah);

  return {
    name,
    price,
    stock,
    priceLabel: formatRupiah(price),
    stockLabel: stockLabel(stock),
    raw,
  };
}

/* ─────────────────────────────  Cache  ───────────────────────────── */

export function getStockStatus(): StockSyncState {
  return { ...syncState };
}

export async function getStockContext(): Promise<string> {
  await ensureSynced();
  if (stockCache.size === 0) return "";

  const items = Array.from(stockCache.values()).map(normalizeStockItem);
  const shown = items.slice(0, 40);

  const lines = shown.map((item) => {
    const parts = [item.name];
    if (item.priceLabel) parts.push(item.priceLabel);
    if (item.stockLabel) parts.push(item.stockLabel);
    return `- ${parts.join(" — ")}`;
  });

  const more =
    items.length > shown.length ? `\n…dan ${items.length - shown.length} produk lainnya.` : "";

  return `\n[STOK PRODUK]\n${lines.join("\n")}${more}\n`;
}

/** Normalized items for the admin preview table. */
export async function getStockPreview(): Promise<Omit<StockItem, "raw">[]> {
  await syncStockNow();
  return Array.from(stockCache.values())
    .map(normalizeStockItem)
    .map(({ name, price, stock, priceLabel, stockLabel }) => ({
      name,
      price,
      stock,
      priceLabel,
      stockLabel,
    }));
}

/** Items shaped for the interactive menu builder (CS panel). */
export async function getStockMenuItems(limit = 30): Promise<
  { id: string; name: string; price: number | null; stock: number | null; priceLabel: string; stockLabel: string }[]
> {
  await ensureSynced();
  return Array.from(stockCache.values())
    .map(normalizeStockItem)
    .filter((item) => item.name && item.name !== "unknown")
    .slice(0, Math.max(1, limit))
    .map((item, index) => ({
      id: `produk_${index + 1}`,
      name: item.name,
      price: item.price,
      stock: item.stock,
      priceLabel: item.priceLabel,
      stockLabel: item.stockLabel,
    }));
}

/** Raw items, kept for the public `/api/v1/stock` contract. */
export async function previewStock(): Promise<Record<string, unknown>[]> {
  await syncStockNow();
  const result: Record<string, unknown>[] = [];
  for (const [key, value] of stockCache) {
    result.push({ name: key, ...value });
  }
  return result;
}

export function clearStockCache(): void {
  stockCache.clear();
  hasSynced = false;
}

export function setStockData(data: Record<string, unknown>[]): void {
  stockCache.clear();
  for (const item of data) {
    const name = String(
      (item as Record<string, unknown>).name ||
        (item as Record<string, unknown>).nama_produk ||
        "unknown"
    );
    stockCache.set(name, item);
  }
}

/* ─────────────────────────────  Sync lifecycle  ───────────────────────────── */

let hasSynced = false;

async function ensureSynced(): Promise<void> {
  if (hasSynced || stockCache.size > 0) return;
  await syncStockNow();
}

async function persistSyncState(): Promise<void> {
  try {
    const rows = await db.select({ id: schema.stockConfig.id }).from(schema.stockConfig).limit(1);
    if (rows.length === 0) return;
    await db
      .update(schema.stockConfig)
      .set({
        last_synced_at: syncState.lastSyncedAt,
        last_sync_status: syncState.status,
        last_sync_error: syncState.lastError,
        last_item_count: syncState.itemCount,
      })
      .where(eq(schema.stockConfig.id, rows[0].id));
  } catch (err) {
    // Columns may be missing on a very old database; the runtime state still
    // works, so this is not fatal.
    logger.debug("[stock] Could not persist sync state:", err);
  }
}

export async function syncStockNow(): Promise<void> {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const startedAt = Date.now();
    syncState = { ...syncState, status: "syncing", lastError: null };

    try {
      const rows = await db.select().from(schema.stockConfig).limit(1);
      if (rows.length === 0) {
        stockCache.clear();
        hasSynced = true;
        syncState = {
          ...syncState,
          status: "idle",
          itemCount: 0,
          durationMs: Date.now() - startedAt,
        };
        return;
      }

      const cfg = rows[0];
      if (!cfg.is_active) {
        stockCache.clear();
        hasSynced = true;
        syncState = {
          ...syncState,
          status: "idle",
          itemCount: 0,
          durationMs: Date.now() - startedAt,
          sourceType: cfg.source_type,
        };
        await persistSyncState();
        return;
      }

      const configJson = parseStockConfigJson(cfg.config_json);
      const sourceType = cfg.source_type as StockSourceType;

      let data: Record<string, unknown>[] = [];
      switch (sourceType) {
        case "google_sheets":
          data = await fetchGoogleSheets(configJson);
          break;
        case "mysql":
          data = await fetchMySQL(configJson);
          break;
        case "postgresql":
          data = await fetchPostgreSQL(configJson);
          break;
        default:
          throw new Error(`Sumber data stok tidak dikenal: ${String(cfg.source_type)}`);
      }

      setStockData(data);
      hasSynced = true;
      syncState = {
        status: "success",
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        itemCount: data.length,
        durationMs: Date.now() - startedAt,
        sourceType,
      };
      logger.info(`[stock] Synced ${data.length} items from ${sourceType}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      syncState = {
        ...syncState,
        status: "error",
        lastError: message,
        durationMs: Date.now() - startedAt,
      };
      // Keep the previous cache so the bot keeps answering with the last known
      // stock instead of suddenly claiming everything is unavailable. Mark as
      // synced so a broken config does not retry on every incoming message;
      // the periodic timer still retries every minute.
      hasSynced = true;
      logger.error("[stock] Sync error:", err);
    } finally {
      await persistSyncState();
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

/** Fetch from a candidate config without touching the live cache. */
export async function testStockConnection(
  sourceType: StockSourceType,
  config: Record<string, unknown>
): Promise<{
  ok: boolean;
  count: number;
  sample: Omit<StockItem, "raw">[];
  error?: string;
}> {
  try {
    let data: Record<string, unknown>[] = [];
    switch (sourceType) {
      case "google_sheets":
        data = await fetchGoogleSheets(config);
        break;
      case "mysql":
        data = await fetchMySQL(config);
        break;
      case "postgresql":
        data = await fetchPostgreSQL(config);
        break;
      default:
        return { ok: false, count: 0, sample: [], error: "Sumber data stok tidak dikenal" };
    }

    const sample = data
      .slice(0, 5)
      .map(normalizeStockItem)
      .map(({ name, price, stock, priceLabel, stockLabel }) => ({
        name,
        price,
        stock,
        priceLabel,
        stockLabel,
      }));

    return { ok: true, count: data.length, sample };
  } catch (err) {
    return {
      ok: false,
      count: 0,
      sample: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function startStockSync(): void {
  if (syncTimer) return;
  syncStockNow();
  syncTimer = setInterval(() => {
    hasSynced = false; // force re-sync
    syncStockNow();
  }, SYNC_INTERVAL_MS);
  logger.info(`[stock] Periodic sync started (${SYNC_INTERVAL_MS / 1000}s)`);
}

export function stopStockSync(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
    logger.info("[stock] Periodic sync stopped");
  }
}

/* ─────────────────────────────  Google Sheets Fetcher  ───────────────────────────── */

async function fetchGoogleSheets(
  config: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const spreadsheetId = extractSpreadsheetId(String(config.spreadsheet_id || ""));
  const sheetName = (config.sheet_name as string) || "Sheet1";
  const columns = (config.columns as Record<string, string>) || {
    name: "A",
    price: "B",
    stock: "C",
  };

  if (!spreadsheetId) {
    throw new Error("Spreadsheet ID / URL belum diisi.");
  }

  // Credentials can come from a pasted JSON blob (friendlier) or a file path.
  let credentials: Record<string, unknown>;
  if (config.credentials_json) {
    try {
      credentials =
        typeof config.credentials_json === "string"
          ? JSON.parse(config.credentials_json)
          : (config.credentials_json as Record<string, unknown>);
    } catch {
      throw new Error("Isi JSON Service Account tidak valid.");
    }
  } else {
    const credPath =
      (config.credentials_path as string) ||
      path.resolve("credentials/service-account.json");
    try {
      const raw = await fs.readFile(credPath, "utf-8");
      credentials = JSON.parse(raw);
    } catch {
      throw new Error(
        `File kredensial tidak ditemukan/tidak valid di ${credPath}. Tempel isi JSON Service Account atau perbaiki path-nya.`
      );
    }
  }

  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials: credentials as any,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const headerRow = (config.header_row as number) || 1;
  const range = `${sheetName}!A${headerRow}:ZZ`;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rows = response.data.values || [];
  if (rows.length === 0) return [];

  // Skip header row
  const dataRows = rows.slice(1);
  const colName = (columns.name || "A").toUpperCase();
  const colPrice = (columns.price || "B").toUpperCase();
  const colStock = (columns.stock || "C").toUpperCase();

  const nameIdx = colToIndex(colName);
  const priceIdx = colToIndex(colPrice);
  const stockIdx = colToIndex(colStock);

  return dataRows
    .map((row: string[]) => ({
      name: row[nameIdx] || "",
      harga: row[priceIdx] || "",
      stok: row[stockIdx] || "",
    }))
    .filter((r: { name: string }) => r.name);
}

/** Convert column letter (A, B, ..., Z, AA, ...) to 0-based index */
function colToIndex(col: string): number {
  let index = 0;
  for (let i = 0; i < col.length; i++) {
    index = index * 26 + (col.charCodeAt(i) - 64);
  }
  return index - 1;
}

/* ─────────────────────────────  MySQL Fetcher  ───────────────────────────── */

async function fetchMySQL(
  config: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const { createConnection } = await import("mysql2/promise");

  if (!config.host) throw new Error("Host database belum diisi.");
  if (!config.table) throw new Error("Nama tabel belum diisi.");

  await assertHostAllowed(config.host as string);

  const connection = await createConnection({
    host: config.host as string,
    port: (config.port as number) || 3306,
    user: config.user as string,
    password: config.password as string,
    database: config.database as string,
    connectTimeout: 10_000,
  });

  try {
    const table = config.table as string;
    const colName = (config.col_name as string) || "nama_produk";
    const colQty = (config.col_qty as string) || "stok";
    const colPrice = (config.col_price as string) || "harga";

    // Whitelist table/column names to prevent SQL injection
    const safeTable = table.replace(/[^a-zA-Z0-9_]/g, "");
    const safeColName = colName.replace(/[^a-zA-Z0-9_]/g, "");
    const safeColQty = colQty.replace(/[^a-zA-Z0-9_]/g, "");
    const safeColPrice = colPrice.replace(/[^a-zA-Z0-9_]/g, "");

    const [rows] = await connection.query(
      `SELECT \`${safeColName}\` as name, \`${safeColQty}\` as stok, \`${safeColPrice}\` as harga FROM \`${safeTable}\``
    );

    return rows as Record<string, unknown>[];
  } finally {
    await connection.end();
  }
}

/* ─────────────────────────────  PostgreSQL Fetcher  ───────────────────────────── */

async function fetchPostgreSQL(
  config: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const { Client } = await import("pg");

  if (!config.host) throw new Error("Host database belum diisi.");
  if (!config.table) throw new Error("Nama tabel belum diisi.");

  await assertHostAllowed(config.host as string);

  const client = new Client({
    host: config.host as string,
    port: (config.port as number) || 5432,
    user: config.user as string,
    password: config.password as string,
    database: config.database as string,
    connectionTimeoutMillis: 10_000,
  });

  try {
    await client.connect();

    const table = config.table as string;
    const colName = (config.col_name as string) || "nama_produk";
    const colQty = (config.col_qty as string) || "stok";
    const colPrice = (config.col_price as string) || "harga";

    // Whitelist table/column names to prevent SQL injection
    const safeTable = table.replace(/[^a-zA-Z0-9_]/g, "");
    const safeColName = colName.replace(/[^a-zA-Z0-9_]/g, "");
    const safeColQty = colQty.replace(/[^a-zA-Z0-9_]/g, "");
    const safeColPrice = colPrice.replace(/[^a-zA-Z0-9_]/g, "");

    const result = await client.query(
      `SELECT "${safeColName}" as name, "${safeColQty}" as stok, "${safeColPrice}" as harga FROM "${safeTable}"`
    );

    return result.rows as Record<string, unknown>[];
  } finally {
    await client.end();
  }
}
