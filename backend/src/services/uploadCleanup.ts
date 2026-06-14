import { readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { db, schema } from "../db/index.js";
import { eq, sql } from "drizzle-orm";
import { logger } from "../utils/logger.js";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads");
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // once per day
const MAX_FILE_AGE_DAYS = 7;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

async function cleanupOldUploads(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - MAX_FILE_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const oldMedia = await db
      .select({ media_url: schema.messages.media_url })
      .from(schema.messages)
      .where(
        sql`${schema.messages.created_at} < ${cutoff} AND ${schema.messages.media_url} IS NOT NULL`
      );

    const referencedUrls = new Set(oldMedia.map((r) => r.media_url).filter(Boolean) as string[]);

    let removedCount = 0;
    let files: string[] = [];
    try {
      files = readdirSync(UPLOAD_DIR);
    } catch (err) {
      logger.warn("[cleanup] Cannot read upload directory:", err);
      return;
    }

    for (const file of files) {
      const urlPath = `/uploads/${file}`;
      if (!referencedUrls.has(urlPath)) {
          try {
            unlinkSync(join(UPLOAD_DIR, file));
            removedCount++;
          } catch (err) {
            logger.debug("[cleanup] Cannot remove file (may be in use):", err);
          }
      }
    }

    if (removedCount > 0) {
      logger.info(`[cleanup] Removed ${removedCount} orphaned upload files`);
    }
  } catch (err) {
    logger.error("[cleanup] Error during upload cleanup:", err);
  }
}

export function startUploadCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupOldUploads, CLEANUP_INTERVAL_MS);
  logger.info(`[cleanup] Upload cleanup started (interval: 24h)`);
}

export function stopUploadCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    logger.info("[cleanup] Upload cleanup stopped");
  }
}
