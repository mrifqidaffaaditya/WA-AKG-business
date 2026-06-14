import { db, schema } from "../db/index.js";
import { eq, and, lt } from "drizzle-orm";
import { getQueueCount } from "./conversation.js";
import { getCsConfig } from "./csConfig.js";
import { sendWaMessage } from "./waGateway.js";
import { notifyResolve } from "./waGroupNotif.js";
import { broadcast } from "../ws/index.js";
import { requestDashboardBroadcast } from "./dashboard.js";
import { createAuditLog } from "../utils/audit.js";
import { logger } from "../utils/logger.js";
import { generateId } from "../utils/id.js";

let timeoutInterval: ReturnType<typeof setInterval> | null = null;

async function checkSessionTimeout() {
  try {
    const botConfigRows = await db.select().from(schema.botConfig).limit(1);
    if (botConfigRows.length === 0) return;

    const botConfig = botConfigRows[0];
    if (!botConfig.auto_close_enabled) return;

    const timeoutMins = botConfig.session_timeout_mins;
    if (timeoutMins < 1) return;

    const warningMins = botConfig.session_timeout_warning_mins;
    const nowStr = new Date().toISOString();

    // 1. Send warning if warning is enabled and threshold is reached
    if (warningMins > 0 && warningMins < timeoutMins) {
      const warningThresholdMins = timeoutMins - warningMins;
      const warningThresholdTime = new Date(Date.now() - warningThresholdMins * 60 * 1000).toISOString();

      // Find all active conversations that have been idle since warningThresholdTime and warning hasn't been sent yet
      const warningConvs = await db
        .select()
        .from(schema.conversations)
        .where(
          and(
            eq(schema.conversations.status, "active"),
            eq(schema.conversations.warning_sent, false),
            lt(schema.conversations.updated_at, warningThresholdTime)
          )
        );

      for (const conv of warningConvs) {
        const id = conv.id;
        const warnText = `Halo, sesi percakapan Anda akan ditutup otomatis dalam ${warningMins} menit karena tidak ada aktivitas. Silakan balas pesan ini jika masih ada yang ingin ditanyakan.`;

        try {
          await sendWaMessage(conv.wa_number, { text: warnText });

          const msgId = generateId();
          const savedMsg = await db.transaction(async (tx) => {
            const [newMsg] = await tx
              .insert(schema.messages)
              .values({
                id: msgId,
                conversation_id: id,
                sender: "bot",
                cs_id: null,
                content: warnText,
                content_type: "text",
                created_at: nowStr,
              })
              .returning();

            await tx
              .update(schema.conversations)
              .set({ warning_sent: true })
              .where(eq(schema.conversations.id, id));

            return newMsg;
          });

          broadcast("conversation:message", { conversationId: id, message: savedMsg });
          logger.info(`[session-timeout] Sent idle warning to customer ${conv.wa_number}`);
        } catch (err) {
          logger.error(`[session-timeout] Failed to send warning to ${conv.wa_number}:`, err);
        }
      }
    }

    // 2. Resolve expired conversations
    const thresholdTime = new Date(Date.now() - timeoutMins * 60 * 1000).toISOString();

    // Find all active conversations that have been idle since thresholdTime
    // (Hold conversations are exempt from timeout!)
    const idleConvs = await db
      .select()
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.status, "active"),
          lt(schema.conversations.updated_at, thresholdTime)
        )
      );

    if (idleConvs.length > 0) {
      logger.info(`[session-timeout] Found ${idleConvs.length} idle conversations to auto-resolve.`);

      const csConfig = await getCsConfig();

      for (const conv of idleConvs) {
        const id = conv.id;
        const now = new Date().toISOString();

        await db
          .update(schema.conversations)
          .set({ status: "resolved", updated_at: now })
          .where(eq(schema.conversations.id, id));

        broadcast("conversation:status", { conversationId: id, status: "resolved" });

        createAuditLog({
          userId: "system",
          action: "resolve_conversation",
          entityType: "conversations",
          entityId: id,
          details: JSON.stringify({ customer: conv.customer_name || conv.wa_number, autoReason: "session_timeout" }),
        });

        let csName = "CS";
        if (conv.claimed_by) {
          const csUserRows = await db.select().from(schema.users).where(eq(schema.users.id, conv.claimed_by)).limit(1);
          if (csUserRows.length > 0) {
            csName = csUserRows[0].name;
          }
        }

        if (csConfig.autoReplyResolveEnabled && csConfig.autoReplyResolve) {
          const resolveMessage = csConfig.autoReplyResolve.replace("{name}", csName);
          try {
            await sendWaMessage(conv.wa_number, { text: resolveMessage });
          } catch (err) {
            logger.error(`[session-timeout] Failed to send auto reply resolve to ${conv.wa_number}:`, err);
          }
        }

        notifyResolve(conv.customer_name || conv.wa_number, csName, null, id).catch((notifErr) =>
          logger.warn("[session-timeout] Resolve notification failed:", notifErr)
        );
      }

      const queueCount = await getQueueCount();
      broadcast("queue:update", { count: queueCount });
      requestDashboardBroadcast();
    }

  } catch (err) {
    logger.error("[session-timeout] Error checking session timeout:", err);
  }
}

export function startSessionTimeoutCheck() {
  if (timeoutInterval) return;
  timeoutInterval = setInterval(checkSessionTimeout, 60 * 1000);
  logger.info("[session-timeout] Background check started (every 1 minute)");
}

export function stopSessionTimeoutCheck() {
  if (timeoutInterval) {
    clearInterval(timeoutInterval);
    timeoutInterval = null;
    logger.info("[session-timeout] Background check stopped");
  }
}
