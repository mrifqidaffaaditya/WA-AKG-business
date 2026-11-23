import crypto from "crypto";
import { db, schema } from "../db/index.js";
import { eq, desc } from "drizzle-orm";
import { generateId } from "../utils/id.js";
import { logger } from "../utils/logger.js";

export interface CreateApiKeyParams {
  name: string;
  permissions?: string[];
  userId?: string | null;
}

export function hashKey(rawKey: string): string {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export async function createApiKey(params: CreateApiKeyParams): Promise<{
  id: string;
  name: string;
  rawKey: string;
  keyPrefix: string;
  permissions: string[];
  createdAt: string;
}> {
  const id = generateId();
  const randomPart = crypto.randomBytes(24).toString("hex");
  const rawKey = `akg_live_${randomPart}`;
  const keyPrefix = rawKey.slice(0, 16) + "...";
  const keyHash = hashKey(rawKey);
  const permissionsList = params.permissions && params.permissions.length > 0 ? params.permissions : ["*"];
  const now = new Date().toISOString();

  await db.insert(schema.apiKeys).values({
    id,
    name: params.name,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    permissions: JSON.stringify(permissionsList),
    created_by: params.userId || null,
    last_used_at: null,
    is_active: true,
    created_at: now,
    updated_at: now,
  });

  return {
    id,
    name: params.name,
    rawKey,
    keyPrefix,
    permissions: permissionsList,
    createdAt: now,
  };
}

export async function verifyApiKey(rawKey: string): Promise<{
  id: string;
  name: string;
  permissions: string[];
  userId: string | null;
} | null> {
  if (!rawKey || typeof rawKey !== "string" || !rawKey.startsWith("akg_live_")) {
    return null;
  }

  const keyHash = hashKey(rawKey);
  const rows = await db
    .select()
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.key_hash, keyHash))
    .limit(1);

  if (rows.length === 0) return null;
  const keyRecord = rows[0];

  if (!keyRecord.is_active) return null;

  // Update last_used_at asynchronously
  const now = new Date().toISOString();
  db.update(schema.apiKeys)
    .set({ last_used_at: now })
    .where(eq(schema.apiKeys.id, keyRecord.id))
    .catch((err) => logger.error("[apiKey] Failed to update last_used_at:", err));

  let permissions: string[] = ["*"];
  try {
    permissions = JSON.parse(keyRecord.permissions);
  } catch {
    permissions = ["*"];
  }

  return {
    id: keyRecord.id,
    name: keyRecord.name,
    permissions,
    userId: keyRecord.created_by,
  };
}

export async function listApiKeys(): Promise<Array<{
  id: string;
  name: string;
  keyPrefix: string;
  permissions: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}>> {
  const rows = await db
    .select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      keyPrefix: schema.apiKeys.key_prefix,
      permissions: schema.apiKeys.permissions,
      isActive: schema.apiKeys.is_active,
      lastUsedAt: schema.apiKeys.last_used_at,
      createdAt: schema.apiKeys.created_at,
    })
    .from(schema.apiKeys)
    .orderBy(desc(schema.apiKeys.created_at));

  return rows.map((r) => {
    let perms: string[] = ["*"];
    try {
      perms = JSON.parse(r.permissions);
    } catch {
      perms = ["*"];
    }
    return {
      id: r.id,
      name: r.name,
      keyPrefix: r.keyPrefix,
      permissions: perms,
      isActive: Boolean(r.isActive),
      lastUsedAt: r.lastUsedAt,
      createdAt: r.createdAt,
    };
  });
}

export async function toggleApiKey(id: string, isActive: boolean): Promise<boolean> {
  const now = new Date().toISOString();
  const res = await db
    .update(schema.apiKeys)
    .set({ is_active: isActive, updated_at: now })
    .where(eq(schema.apiKeys.id, id));
  return true;
}

export async function deleteApiKey(id: string): Promise<boolean> {
  await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, id));
  return true;
}
