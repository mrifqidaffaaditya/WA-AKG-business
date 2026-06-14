import { createClient } from "@libsql/client";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const client = createClient({ url: config.dbPath });

const MIGRATIONS = [
  `PRAGMA journal_mode = WAL`,
  `PRAGMA busy_timeout = 5000`,
  `PRAGMA foreign_keys = ON`,
  `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cs' CHECK(role IN ('super_admin','admin','cs')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  )`,
  `
  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    wa_number TEXT NOT NULL UNIQUE,
    display_name TEXT,
    total_sessions INTEGER NOT NULL DEFAULT 0,
    last_conversation_id TEXT,
    last_summary TEXT,
    last_active_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    wa_number TEXT NOT NULL,
    customer_name TEXT,
    status TEXT NOT NULL DEFAULT 'bot' CHECK(status IN ('bot','waiting','active','resolved')),
    claimed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    rating INTEGER,
    review TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK(sender IN ('customer','bot','cs')),
    cs_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    content TEXT,
    content_type TEXT NOT NULL DEFAULT 'text' CHECK(content_type IN ('text','image','video','document')),
    media_url TEXT,
    media_type TEXT,
    file_name TEXT,
    file_size INTEGER,
    wa_message_id TEXT,
    created_at TEXT NOT NULL
  )`,
  `
  CREATE TABLE IF NOT EXISTS bot_config (
    id TEXT PRIMARY KEY,
    persona_name TEXT NOT NULL DEFAULT 'Bot AKG',
    system_prompt TEXT,
    business_info TEXT,
    escalation_keywords TEXT,
    session_timeout_mins INTEGER NOT NULL DEFAULT 30,
    auto_close_enabled INTEGER NOT NULL DEFAULT 0,
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TEXT NOT NULL
  )`,
  `
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TEXT NOT NULL,
    last_used_at TEXT
  )`,
  `
  CREATE TABLE IF NOT EXISTS notification_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notif_type TEXT NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    dnd_start TEXT,
    dnd_end TEXT
  )`,
  `
  CREATE TABLE IF NOT EXISTS stock_config (
    id TEXT PRIMARY KEY,
    source_type TEXT CHECK(source_type IN ('google_sheets','mysql','postgresql')),
    config_json TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )`,
  `
  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL
  )`,
  `
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0
  )`,
  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at DESC)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa_message_id ON messages(wa_message_id)`,
  `CREATE INDEX IF NOT EXISTS idx_conversations_status_updated ON conversations(status, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_customers_wa_number ON customers(wa_number)`,
  `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token)`,
  `
  CREATE TABLE IF NOT EXISTS cs_config (
    id TEXT PRIMARY KEY,
    signature_enabled INTEGER NOT NULL DEFAULT 0,
    signature_template TEXT NOT NULL DEFAULT ' - {name}',
    quick_replies TEXT NOT NULL,
    auto_reply_claim_enabled INTEGER NOT NULL DEFAULT 1,
    auto_reply_claim TEXT NOT NULL,
    auto_reply_resolve_enabled INTEGER NOT NULL DEFAULT 1,
    auto_reply_resolve TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
  `,
];

async function addColumnIfNotExists(
  table: string,
  column: string,
  definition: string
): Promise<void> {
  const tableInfo = await client.execute(`PRAGMA table_info(${table})`);
  const exists = tableInfo.rows.some((r: unknown) => (r as Record<string, unknown>).name === column);
  if (!exists) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[migrate] Added column ${table}.${column}`);
  }
}

async function run() {
  console.log("[migrate] Running migrations...");
  await client.execute("BEGIN TRANSACTION");
  try {
    for (const sql of MIGRATIONS) {
      try {
        await client.execute(sql);
      } catch (err: unknown) {
        const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
        // Skip "duplicate column" errors on ALTER TABLE (handled gracefully)
        if (msg.includes("duplicate column name")) continue;
        logger.error(`[migrate] Migration error: ${msg}`);
      }
    }
    // Add jid column to customers table if it doesn't exist
    const tableInfo = await client.execute("PRAGMA table_info(customers)");
    const hasJid = tableInfo.rows.some((r: unknown) => (r as Record<string, unknown>).name === "jid");
    if (!hasJid) {
      await client.execute("ALTER TABLE customers ADD COLUMN jid TEXT");
    }

    await addColumnIfNotExists("cs_config", "wa_group_notif_enabled", "INTEGER NOT NULL DEFAULT 0");
    await addColumnIfNotExists("cs_config", "wa_group_jid", "TEXT NOT NULL DEFAULT ''");

    await client.execute("COMMIT");
    console.log("[migrate] Done.");
  } catch (err) {
    await client.execute("ROLLBACK");
    console.error("[migrate] Migration failed:", err);
    throw err;
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
