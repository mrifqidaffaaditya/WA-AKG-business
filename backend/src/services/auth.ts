// @ts-nocheck
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { db, schema } from "../db/index.js";
import { generateId } from "../utils/id.js";
import { eq, and } from "drizzle-orm";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(payload: {
  sub: string;
  role: string;
}): string {
  return jwt.sign({ ...payload, type: "access" }, config.appSecret, {
    expiresIn: config.jwt.accessExpiresIn as any,
  });
}

export function generateRefreshToken(payload: {
  sub: string;
  role: string;
}): string {
  return jwt.sign({ ...payload, type: "refresh" }, config.appSecret, {
    expiresIn: config.jwt.refreshExpiresIn as any,
  });
}

export function verifyAccessToken(token: string): { sub: string; role: string } {
  const decoded = jwt.verify(token, config.appSecret) as any;
  if (decoded.type && decoded.type !== "access") {
    throw new Error("Invalid token type");
  }
  return { sub: decoded.sub, role: decoded.role };
}

export function verifyRefreshToken(
  token: string
): { sub: string; role: string } {
  const decoded = jwt.verify(token, config.appSecret) as any;
  if (decoded.type && decoded.type !== "refresh") {
    throw new Error("Invalid token type");
  }
  return { sub: decoded.sub, role: decoded.role };
}

export async function storeRefreshToken(
  userId: string,
  token: string
): Promise<void> {
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  await db.insert(schema.refreshTokens).values({
    id: generateId(),
    user_id: userId,
    token,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
    revoked: false,
  });
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await db
    .update(schema.refreshTokens)
    .set({ revoked: true })
    .where(eq(schema.refreshTokens.token, token));
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await db
    .update(schema.refreshTokens)
    .set({ revoked: true })
    .where(
      and(
        eq(schema.refreshTokens.user_id, userId),
        eq(schema.refreshTokens.revoked, false)
      )
    );
}

export async function isRefreshTokenValid(token: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(schema.refreshTokens)
    .where(
      and(
        eq(schema.refreshTokens.token, token),
        eq(schema.refreshTokens.revoked, false)
      )
    )
    .limit(1);

  if (rows.length === 0) return false;
  const rt = rows[0];
  if (new Date(rt.expires_at) < new Date()) return false;
  return true;
}
