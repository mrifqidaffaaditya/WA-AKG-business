import { db, schema } from "../db/index.js";
import { generateId } from "./id.js";

export async function createAuditLog(params: {
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: string;
}) {
  await db.insert(schema.auditLog).values({
    id: generateId(),
    user_id: params.userId,
    action: params.action,
    entity_type: params.entityType || null,
    entity_id: params.entityId || null,
    details: params.details || null,
    created_at: new Date().toISOString(),
  });
}
