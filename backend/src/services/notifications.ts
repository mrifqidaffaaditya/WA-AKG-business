import webpush from "web-push";
import { config } from "../config.js";
import { db, schema } from "../db/index.js";
import { generateId } from "../utils/id.js";
import { eq, and } from "drizzle-orm";
import { logger } from "../utils/logger.js";

if (config.vapid.publicKey && config.vapid.privateKey) {
  webpush.setVapidDetails(
    config.vapid.subject,
    config.vapid.publicKey,
    config.vapid.privateKey
  );
}

export async function addSubscription(params: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<void> {
  const existing = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.user_id, params.userId),
        eq(schema.pushSubscriptions.endpoint, params.endpoint)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.pushSubscriptions)
      .set({ last_used_at: new Date().toISOString() })
      .where(eq(schema.pushSubscriptions.id, existing[0].id));
    return;
  }

  await db.insert(schema.pushSubscriptions).values({
    id: generateId(),
    user_id: params.userId,
    endpoint: params.endpoint,
    p256dh: params.p256dh,
    auth: params.auth,
    user_agent: params.userAgent || null,
    created_at: new Date().toISOString(),
    last_used_at: new Date().toISOString(),
  });
}

export async function removeSubscription(
  endpoint: string,
  userId?: string
): Promise<void> {
  if (userId) {
    await db
      .delete(schema.pushSubscriptions)
      .where(
        and(
          eq(schema.pushSubscriptions.endpoint, endpoint),
          eq(schema.pushSubscriptions.user_id, userId)
        )
      );
  } else {
    await db
      .delete(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.endpoint, endpoint));
  }
}

export async function removeUserSubscriptions(userId: string): Promise<void> {
  await db
    .delete(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.user_id, userId));
}

const notifDebounce = new Map<string, number>();
const DEBOUNCE_CLEANUP_INTERVAL = 600_000; // 10 min
let lastDebounceCleanup = Date.now();

function shouldDebounce(key: string): boolean {
  const last = notifDebounce.get(key);
  const now = Date.now();
  if (last && now - last < config.notifDebounceSeconds * 1000) {
    return true;
  }
  notifDebounce.set(key, now);

  // Evict stale entries periodically
  if (now - lastDebounceCleanup > DEBOUNCE_CLEANUP_INTERVAL) {
    lastDebounceCleanup = now;
    const cutoff = now - config.notifDebounceSeconds * 1000;
    for (const [k, t] of notifDebounce) {
      if (t < cutoff) notifDebounce.delete(k);
    }
  }
  return false;
}

export async function sendNotificationToUser(
  userId: string,
  payload: { title: string; body: string; icon?: string; url?: string; tag?: string }
): Promise<void> {
  if (shouldDebounce(`${userId}:${payload.tag || payload.title}`)) return;

  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.user_id, userId));

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({
          title: payload.title,
          body: payload.body,
          icon: payload.icon || undefined,
          data: { url: payload.url },
          tag: payload.tag,
          requireInteraction: false,
        })
      );
      await db
        .update(schema.pushSubscriptions)
        .set({ last_used_at: new Date().toISOString() })
        .where(eq(schema.pushSubscriptions.id, sub.id));
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        logger.info(`[push] Removing expired subscription for user ${userId}`);
        await db
          .delete(schema.pushSubscriptions)
          .where(eq(schema.pushSubscriptions.id, sub.id));
      } else {
        logger.error(`[push] Error sending to user ${userId}:`, err);
      }
    }
  }
}

export async function sendNotificationToAllCs(payload: {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
}): Promise<void> {
  const csUsers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.is_active, true),
        eq(schema.users.role, "cs")
      )
    );

  for (const user of csUsers) {
    await sendNotificationToUser(user.id, payload);
  }
}

export async function sendNotificationToAllAdmins(payload: {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
}): Promise<void> {
  const adminUsers = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.is_active, true),
        eq(schema.users.role, "admin")
      )
    );

  for (const user of adminUsers) {
    await sendNotificationToUser(user.id, payload);
  }

  const superAdmins = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.is_active, true),
        eq(schema.users.role, "super_admin")
      )
    );

  for (const user of superAdmins) {
    await sendNotificationToUser(user.id, payload);
  }
}

export async function getUserPreferences(userId: string) {
  return db
    .select()
    .from(schema.notificationPreferences)
    .where(eq(schema.notificationPreferences.user_id, userId));
}

export async function updateUserPreference(
  userId: string,
  notifType: string,
  isEnabled: boolean
): Promise<void> {
  const existing = await db
    .select()
    .from(schema.notificationPreferences)
    .where(
      and(
        eq(schema.notificationPreferences.user_id, userId),
        eq(schema.notificationPreferences.notif_type, notifType)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.notificationPreferences)
      .set({ is_enabled: isEnabled })
      .where(eq(schema.notificationPreferences.id, existing[0].id));
  } else {
    await db.insert(schema.notificationPreferences).values({
      id: generateId(),
      user_id: userId,
      notif_type: notifType,
      is_enabled: isEnabled,
      dnd_start: null,
      dnd_end: null,
    });
  }
}
