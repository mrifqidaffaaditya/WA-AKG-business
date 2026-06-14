import { db, schema } from "../db/index.js";
import { eq, and, sql, desc } from "drizzle-orm";
import { getActiveUserIds, broadcast } from "../ws/index.js";
import { logger } from "../utils/logger.js";

export interface DashboardStats {
  totalConversations: number;
  activeConversations: number;
  waitingConversations: number;
  resolvedConversations: number;
  botConversations: number;
  totalCs: number;
  onlineCs: number;
  totalCustomers: number;
  todayMessages: number;
  avgRating: number;
  recentReviews: {
    id: string;
    customer_name: string | null;
    wa_number: string;
    rating: number | null;
    review: string | null;
    resolved_at: string;
  }[];
  conversationsByStatus: Record<string, number>;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const convCounts = await db
    .select({
      status: schema.conversations.status,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(schema.conversations)
    .groupBy(schema.conversations.status);

  const totalConversations = convCounts.reduce((sum, r) => sum + r.count, 0);
  const conversationsByStatus: Record<string, number> = {};
  for (const r of convCounts) {
    conversationsByStatus[r.status] = r.count;
  }

  const csCount = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.users)
    .where(and(eq(schema.users.role, "cs"), eq(schema.users.is_active, true)));

  const customerCount = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.customers);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMessages = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(schema.messages)
    .where(sql`${schema.messages.created_at} >= ${todayStart.toISOString()}`);

  const ratingRows = await db
    .select({
      avg: sql<number>`AVG(${schema.conversations.rating})`.mapWith(Number),
    })
    .from(schema.conversations)
    .where(sql`${schema.conversations.rating} IS NOT NULL`);

  const recentReviews = await db
    .select({
      id: schema.conversations.id,
      customer_name: schema.conversations.customer_name,
      wa_number: schema.conversations.wa_number,
      rating: schema.conversations.rating,
      review: schema.conversations.review,
      resolved_at: schema.conversations.updated_at,
    })
    .from(schema.conversations)
    .where(sql`${schema.conversations.rating} IS NOT NULL`)
    .orderBy(desc(schema.conversations.updated_at))
    .limit(6);

  const activeIds = getActiveUserIds();

  return {
    totalConversations,
    activeConversations: conversationsByStatus["active"] || 0,
    waitingConversations: conversationsByStatus["waiting"] || 0,
    resolvedConversations: conversationsByStatus["resolved"] || 0,
    botConversations: conversationsByStatus["bot"] || 0,
    totalCs: csCount[0]?.count || 0,
    onlineCs: activeIds.length,
    totalCustomers: customerCount[0]?.count || 0,
    todayMessages: todayMessages[0]?.count || 0,
    avgRating: ratingRows[0]?.avg || 0,
    recentReviews,
    conversationsByStatus,
  };
}

let broadcastTimeout: ReturnType<typeof setTimeout> | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;

export async function broadcastDashboardStats(): Promise<void> {
  try {
    const stats = await getDashboardStats();
    broadcast("dashboard:stats", stats);
  } catch (err) {
    logger.error("[dashboard] Failed to broadcast stats:", err);
  }
}

export function requestDashboardBroadcast(): void {
  if (broadcastTimeout) return;
  broadcastTimeout = setTimeout(() => {
    broadcastTimeout = null;
    broadcastDashboardStats().catch(() => {});
  }, 2000);
}

export function startDashboardPeriodic(): void {
  if (periodicTimer) return;
  periodicTimer = setInterval(() => {
    broadcastDashboardStats().catch(() => {});
  }, 30_000);
  logger.info("[dashboard] Periodic stats broadcast started (30s)");
}
