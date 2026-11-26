/**
 * Smoke test for the friendly stock-config helpers (no DB access).
 * Run: cd backend && npx esbuild ../lab/stock-config-smoke.ts --bundle \
 *   --platform=node --format=esm --packages=external --outfile=.smoke.mjs && node .smoke.mjs
 */
import {
  mergeStockConfig,
  buildConfigFromFields,
  configToFriendlyFields,
  extractSpreadsheetId,
  normalizeStockItem,
  maskStockConfig,
  parseStockConfigJson,
} from "../backend/src/services/stock.js";

const existing = {
  host: "db.local",
  port: 3306,
  database: "stok",
  user: "readonly",
  password: "rahasia-lama",
  table: "products",
  col_name: "nama_produk",
  col_qty: "stok",
  col_price: "harga",
};

// Saving the form with an empty/masked password must not wipe the secret.
const fromForm = buildConfigFromFields("mysql", {
  host: "db.local",
  port: 3306,
  database: "stok",
  user: "readonly",
  password: "",
  table: "products",
  colName: "nama_produk",
  colQty: "stok",
  colPrice: "harga",
});
const merged = mergeStockConfig(existing, fromForm);
console.log("PASSWORD PRESERVED:", merged.password === "rahasia-lama");

const masked = mergeStockConfig(existing, { password: "***" });
console.log("MASKED PRESERVED:", masked.password === "rahasia-lama");

const newPassword = mergeStockConfig(existing, { password: "baru" });
console.log("NEW PASSWORD APPLIED:", newPassword.password === "baru");

// Google Sheets: a full URL is reduced to the spreadsheet ID.
console.log(
  "SPREADSHEET ID:",
  extractSpreadsheetId("https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit#gid=0")
);

const sheetsConfig = buildConfigFromFields("google_sheets", {
  spreadsheetId: "https://docs.google.com/spreadsheets/d/ABC123/edit",
  sheetName: "Stok",
  headerRow: 2,
  colName: "b",
  colPrice: "d",
  colStock: "c",
  credentialsJson: '{"type":"service_account","client_email":"x@y.z"}',
});
console.log("SHEETS CONFIG:", JSON.stringify(sheetsConfig));

const friendly = configToFriendlyFields("google_sheets", sheetsConfig);
console.log("FRIENDLY FIELDS:", JSON.stringify(friendly));

// Masking + parsing
console.log("MASKED:", JSON.stringify(maskStockConfig(existing)));
console.log("PARSE STRING:", JSON.stringify(parseStockConfigJson('{"a":1}')));
console.log("PARSE BROKEN:", JSON.stringify(parseStockConfigJson("{bad")));

// Normalization of Indonesian number formats
for (const raw of [
  { name: "Kopi", harga: "Rp 50.000", stok: "12" },
  { name: "Teh", harga: "75000", stok: 0 },
  { name: "Susu", price: "50,000", stock: "3" },
  { name: "Gula", harga: "", stok: "" },
]) {
  const item = normalizeStockItem(raw);
  console.log(
    "ITEM:",
    item.name,
    "|",
    item.priceLabel || "-",
    "|",
    item.stockLabel || "-"
  );
}
