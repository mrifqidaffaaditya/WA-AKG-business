import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  role: text("role", { enum: ["super_admin", "admin", "cs"] })
    .notNull()
    .default("cs"),
  is_active: integer("is_active", { mode: "boolean" }).notNull().default(true),
  created_at: text("created_at").notNull(),
});

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  wa_number: text("wa_number").notNull().unique(),
  display_name: text("display_name"),
  total_sessions: integer("total_sessions").notNull().default(0),
  last_conversation_id: text("last_conversation_id"),
  last_summary: text("last_summary"),
  last_active_at: text("last_active_at"),
  created_at: text("created_at").notNull(),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  customer_id: text("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  wa_number: text("wa_number").notNull(),
  customer_name: text("customer_name"),
  status: text("status", { enum: ["bot", "waiting", "active", "resolved"] })
    .notNull()
    .default("bot"),
  claimed_by: text("claimed_by").references(() => users.id, {
    onDelete: "set null",
  }),
  rating: integer("rating"),
  review: text("review"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversation_id: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  sender: text("sender", { enum: ["customer", "bot", "cs"] }).notNull(),
  cs_id: text("cs_id").references(() => users.id, { onDelete: "set null" }),
  content: text("content"),
  content_type: text("content_type", {
    enum: ["text", "image", "video", "document"],
  })
    .notNull()
    .default("text"),
  media_url: text("media_url"),
  media_type: text("media_type"),
  file_name: text("file_name"),
  file_size: integer("file_size"),
  wa_message_id: text("wa_message_id"),
  created_at: text("created_at").notNull(),
});

export const botConfig = sqliteTable("bot_config", {
  id: text("id").primaryKey(),
  persona_name: text("persona_name").notNull().default("Bot AKG"),
  system_prompt: text("system_prompt"),
  business_info: text("business_info"),
  escalation_keywords: text("escalation_keywords"),
  session_timeout_mins: integer("session_timeout_mins").notNull().default(30),
  auto_close_enabled: integer("auto_close_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  updated_by: text("updated_by").references(() => users.id, {
    onDelete: "set null",
  }),
  updated_at: text("updated_at").notNull(),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  user_agent: text("user_agent"),
  created_at: text("created_at").notNull(),
  last_used_at: text("last_used_at"),
});

export const notificationPreferences = sqliteTable("notification_preferences", {
  id: text("id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  notif_type: text("notif_type").notNull(),
  is_enabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  dnd_start: text("dnd_start"),
  dnd_end: text("dnd_end"),
});

export const stockConfig = sqliteTable("stock_config", {
  id: text("id").primaryKey(),
  source_type: text("source_type", {
    enum: ["google_sheets", "mysql", "postgresql"],
  }),
  config_json: text("config_json"),
  is_active: integer("is_active", { mode: "boolean" }).notNull().default(false),
  updated_at: text("updated_at").notNull(),
});

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey(),
  user_id: text("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity_type: text("entity_type"),
  entity_id: text("entity_id"),
  details: text("details"),
  created_at: text("created_at").notNull(),
});

export const refreshTokens = sqliteTable("refresh_tokens", {
  id: text("id").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  expires_at: text("expires_at").notNull(),
  created_at: text("created_at").notNull(),
  revoked: integer("revoked", { mode: "boolean" }).notNull().default(false),
});

export const csConfig = sqliteTable("cs_config", {
  id: text("id").primaryKey(),
  signature_enabled: integer("signature_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  signature_template: text("signature_template").notNull().default(" - {name}"),
  quick_replies: text("quick_replies").notNull(),
  auto_reply_claim_enabled: integer("auto_reply_claim_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  auto_reply_claim: text("auto_reply_claim").notNull(),
  auto_reply_resolve_enabled: integer("auto_reply_resolve_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  auto_reply_resolve: text("auto_reply_resolve").notNull(),
  updated_at: text("updated_at").notNull(),
});
