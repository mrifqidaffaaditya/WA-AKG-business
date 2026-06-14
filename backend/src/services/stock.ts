import { db, schema } from "../db/index.js";
import { logger } from "../utils/logger.js";
import fs from "fs/promises";
import path from "path";

const stockCache = new Map<string, Record<string, unknown>>();
let syncTimer: ReturnType<typeof setInterval> | null = null;
const SYNC_INTERVAL_MS = 60_000; // 60 seconds

// ── Core cache functions ─────────────────────────────────────

export async function getStockContext(): Promise<string> {
  await ensureSynced();
  if (stockCache.size === 0) return "";

  const items: string[] = [];
  for (const [key, value] of stockCache) {
    const stok = value.stok ?? value.stock ?? value.qty ?? "";
    const harga = value.harga ?? value.price ?? "";
    const parts = [`${key}:`];
    if (stok !== "") parts.push(`${stok} pcs`);
    if (harga !== "") parts.push(`Rp${Number(harga).toLocaleString("id-ID")}`);
    items.push(`- ${parts.join(" ")}`);
  }

  return `\n[STOK TERSEDIA]\n${items.join("\n")}\n`;
}

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
}

export function setStockData(data: Record<string, unknown>[]): void {
  stockCache.clear();
  for (const item of data) {
    const name =
      (item as any).name || (item as any).nama_produk || "unknown";
    stockCache.set(name, item);
  }
}

// ── Sync lifecycle ───────────────────────────────────────────

let hasSynced = false;

async function ensureSynced(): Promise<void> {
  if (hasSynced || stockCache.size > 0) return;
  await syncStockNow();
}

export async function syncStockNow(): Promise<void> {
  try {
    const rows = await db.select().from(schema.stockConfig).limit(1);
    if (rows.length === 0 || !rows[0].is_active) return;

    const cfg = rows[0];
    let configJson: Record<string, unknown>;
    try {
      configJson =
        typeof cfg.config_json === "string"
          ? JSON.parse(cfg.config_json)
          : (cfg.config_json as unknown as Record<string, unknown>) || {};
    } catch {
      logger.error("[stock] Invalid config_json");
      return;
    }

    let data: Record<string, unknown>[] = [];

    switch (cfg.source_type) {
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
        logger.warn(`[stock] Unknown source_type: ${cfg.source_type}`);
        return;
    }

    setStockData(data);
    hasSynced = true;
    logger.info(`[stock] Synced ${data.length} items from ${cfg.source_type}`);
  } catch (err) {
    logger.error("[stock] Sync error:", err);
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

// ── Google Sheets Fetcher ────────────────────────────────────

async function fetchGoogleSheets(
  config: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const spreadsheetId = config.spreadsheet_id as string;
  const sheetName = (config.sheet_name as string) || "Sheet1";
  const columns = (config.columns as Record<string, string>) || {
    name: "A",
    price: "B",
    stock: "C",
  };

  if (!spreadsheetId) {
    logger.warn("[stock] Google Sheets: missing spreadsheet_id");
    return [];
  }

  // Load service account credentials
  const credPath =
    (config.credentials_path as string) ||
    path.resolve("credentials/service-account.json");

  let credentials: Record<string, unknown>;
  try {
    const raw = await fs.readFile(credPath, "utf-8");
    credentials = JSON.parse(raw);
  } catch {
    logger.error(`[stock] Google Sheets: cannot read credentials at ${credPath}`);
    return [];
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

// ── MySQL Fetcher ────────────────────────────────────────────

async function fetchMySQL(
  config: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const { createConnection } = await import("mysql2/promise");

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

// ── PostgreSQL Fetcher ───────────────────────────────────────

async function fetchPostgreSQL(
  config: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const { Client } = await import("pg");

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
