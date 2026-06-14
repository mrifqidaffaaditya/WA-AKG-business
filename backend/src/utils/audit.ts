import { db, schema } from "../db/index.js";
import { generateId } from "./id.js";
import { logger } from "./logger.js";

export async function createAuditLog(params: {
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: string;
}) {
  try {
    await db.insert(schema.auditLog).values({
      id: generateId(),
      user_id: params.userId,
      action: params.action.slice(0, 255),
      entity_type: (params.entityType || "").slice(0, 100) || null,
      entity_id: (params.entityId || "").slice(0, 100) || null,
      details: (params.details || "").slice(0, 1000) || null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("[audit] Failed to write audit log:", err);
  }
}
