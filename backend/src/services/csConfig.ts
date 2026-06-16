import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { generateId } from "../utils/id.js";
import { logger } from "../utils/logger.js";

export interface CsConfig {
  signatureEnabled: boolean;
  signatureTemplate: string;
  quickReplies: string[];
  autoReplyClaimEnabled: boolean;
  autoReplyClaim: string;
  autoReplyResolveEnabled: boolean;
  autoReplyResolve: string;
  waGroupNotifEnabled: boolean;
  waGroupJid: string;
}

const defaultConfig: CsConfig = {
  signatureEnabled: false,
  signatureTemplate: " - {name}",
  quickReplies: [
    "Halo, ada yang bisa kami bantu?",
    "Mohon tunggu sebentar ya, sedang kami cek.",
    "Terima kasih telah menghubungi kami. Semoga harimu menyenangkan!"
  ],
  autoReplyClaimEnabled: true,
  autoReplyClaim: "Halo, dengan CS {name} di sini. Ada yang bisa saya bantu?",
  autoReplyResolveEnabled: true,
  autoReplyResolve: "Terima kasih telah menghubungi kami. Sesi obrolan ini telah ditutup. \n\nMohon berikan penilaian atas pelayanan kami dengan membalas pesan ini menggunakan angka 1 (Sangat Buruk) hingga 5 (Sangat Baik).",
  waGroupNotifEnabled: false,
  waGroupJid: "",
};

const ALLOWED_CS_CONFIG_FIELDS = [
  "signatureEnabled",
  "signatureTemplate",
  "quickReplies",
  "autoReplyClaimEnabled",
  "autoReplyClaim",
  "autoReplyResolveEnabled",
  "autoReplyResolve",
  "waGroupNotifEnabled",
  "waGroupJid",
];

const BOOLEAN_FIELDS = [
  "signatureEnabled",
  "autoReplyClaimEnabled",
  "autoReplyResolveEnabled",
  "waGroupNotifEnabled",
];

const STRING_FIELDS = [
  "signatureTemplate",
  "autoReplyClaim",
  "autoReplyResolve",
  "waGroupJid",
];

const MAX_STRING_LEN = 4000;

/**
 * Validate a partial cs-config payload before it is persisted. The update path
 * previously spread req.body directly, so wrong types (e.g. a number where a
 * boolean is expected) or unknown keys could be written. Returns an error
 * message, or null when the payload is acceptable.
 */
export function validateCsConfigFields(body: Record<string, unknown>): string | null {
  const unknown = Object.keys(body).filter((k) => !ALLOWED_CS_CONFIG_FIELDS.includes(k));
  if (unknown.length > 0) {
    return `Unknown field(s): ${unknown.join(", ")}`;
  }
  for (const f of BOOLEAN_FIELDS) {
    if (body[f] !== undefined && typeof body[f] !== "boolean") {
      return `${f} must be a boolean`;
    }
  }
  for (const f of STRING_FIELDS) {
    if (body[f] !== undefined) {
      if (typeof body[f] !== "string") return `${f} must be a string`;
      if ((body[f] as string).length > MAX_STRING_LEN) return `${f} is too long`;
    }
  }
  if (body.quickReplies !== undefined) {
    if (
      !Array.isArray(body.quickReplies) ||
      !body.quickReplies.every((q) => typeof q === "string")
    ) {
      return "quickReplies must be an array of strings";
    }
    if ((body.quickReplies as string[]).length > 50) {
      return "quickReplies cannot exceed 50 entries";
    }
  }
  if (body.waGroupJid !== undefined && body.waGroupJid !== "") {
    // WhatsApp group JIDs look like 123-456@g.us; reject anything else early.
    if (!/^[0-9]+(-[0-9]+)?@g\.us$/.test(body.waGroupJid as string)) {
      return "waGroupJid must be a valid WhatsApp group JID (e.g. 123456-789@g.us)";
    }
  }
  return null;
}

export async function getCsConfig(): Promise<CsConfig> {
  try {
    const rows = await db.select().from(schema.csConfig).limit(1);
    if (rows.length > 0) {
      const row = rows[0];
      return {
        signatureEnabled: row.signature_enabled,
        signatureTemplate: row.signature_template,
        quickReplies: JSON.parse(row.quick_replies),
        autoReplyClaimEnabled: row.auto_reply_claim_enabled,
        autoReplyClaim: row.auto_reply_claim,
        autoReplyResolveEnabled: row.auto_reply_resolve_enabled,
        autoReplyResolve: row.auto_reply_resolve,
        waGroupNotifEnabled: row.wa_group_notif_enabled,
        waGroupJid: row.wa_group_jid,
      };
    }
    
    // Seed default if empty
    const id = generateId();
    const now = new Date().toISOString();
    await db.insert(schema.csConfig).values({
      id,
      signature_enabled: defaultConfig.signatureEnabled,
      signature_template: defaultConfig.signatureTemplate,
      quick_replies: JSON.stringify(defaultConfig.quickReplies),
      auto_reply_claim_enabled: defaultConfig.autoReplyClaimEnabled,
      auto_reply_claim: defaultConfig.autoReplyClaim,
      auto_reply_resolve_enabled: defaultConfig.autoReplyResolveEnabled,
      auto_reply_resolve: defaultConfig.autoReplyResolve,
      wa_group_notif_enabled: defaultConfig.waGroupNotifEnabled,
      wa_group_jid: defaultConfig.waGroupJid,
      updated_at: now,
    });
    return defaultConfig;
  } catch (err) {
    logger.error("Failed to read cs_config from db", err);
    return defaultConfig;
  }
}

export async function updateCsConfig(config: Partial<CsConfig>): Promise<CsConfig> {
  try {
    const current = await getCsConfig();
    const updated = { ...current, ...config };
    
    const rows = await db.select().from(schema.csConfig).limit(1);
    const now = new Date().toISOString();
    
    if (rows.length > 0) {
      await db.update(schema.csConfig).set({
        signature_enabled: updated.signatureEnabled,
        signature_template: updated.signatureTemplate,
        quick_replies: JSON.stringify(updated.quickReplies),
        auto_reply_claim_enabled: updated.autoReplyClaimEnabled,
        auto_reply_claim: updated.autoReplyClaim,
        auto_reply_resolve_enabled: updated.autoReplyResolveEnabled,
        auto_reply_resolve: updated.autoReplyResolve,
        wa_group_notif_enabled: updated.waGroupNotifEnabled,
        wa_group_jid: updated.waGroupJid,
        updated_at: now,
      }).where(eq(schema.csConfig.id, rows[0].id));
    } else {
      const id = generateId();
      await db.insert(schema.csConfig).values({
        id,
        signature_enabled: updated.signatureEnabled,
        signature_template: updated.signatureTemplate,
        quick_replies: JSON.stringify(updated.quickReplies),
        auto_reply_claim_enabled: updated.autoReplyClaimEnabled,
        auto_reply_claim: updated.autoReplyClaim,
        auto_reply_resolve_enabled: updated.autoReplyResolveEnabled,
        auto_reply_resolve: updated.autoReplyResolve,
        wa_group_notif_enabled: updated.waGroupNotifEnabled,
        wa_group_jid: updated.waGroupJid,
        updated_at: now,
      });
    }
    return updated;
  } catch (err) {
    logger.error("Failed to update cs_config in db", err);
    return { ...defaultConfig, ...config };
  }
}
