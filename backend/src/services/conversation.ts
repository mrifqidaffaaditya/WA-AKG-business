import { db, schema } from "../db/index.js";
import { generateId } from "../utils/id.js";
import { eq, desc, and, lt, sql, inArray, SQL } from "drizzle-orm";

export async function findOrCreateCustomer(params: {
  waNumber: string;
  displayName?: string;
  jid?: string;
}): Promise<{ customer: typeof schema.customers.$inferSelect; isNew: boolean }> {
  const existing = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.wa_number, params.waNumber))
    .limit(1);

  if (existing.length > 0) {
    const cust = existing[0];
    if (params.jid && cust.jid !== params.jid) {
      await db.update(schema.customers)
        .set({ jid: params.jid })
        .where(eq(schema.customers.id, cust.id));
      cust.jid = params.jid;
    }
    return { customer: cust, isNew: false };
  }

  const now = new Date().toISOString();
  const id = generateId();
  await db.insert(schema.customers).values({
    id,
    wa_number: params.waNumber,
    display_name: params.displayName || null,
    total_sessions: 0,
    last_conversation_id: null,
    last_summary: null,
    last_active_at: now,
    created_at: now,
    jid: params.jid || null,
  });

  const rows = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.id, id))
    .limit(1);
  return { customer: rows[0], isNew: true };
}

export type ConversationStatus = "bot" | "waiting" | "active" | "resolved" | "hold";

export async function createConversation(params: {
  customerId: string;
  waNumber: string;
  customerName?: string;
}): Promise<typeof schema.conversations.$inferSelect> {
  const id = generateId();
  const now = new Date().toISOString();

  await db.transaction(async (tx) => {
    await tx.insert(schema.conversations).values({
      id,
      customer_id: params.customerId,
      wa_number: params.waNumber,
      customer_name: params.customerName || null,
      status: "bot",
      claimed_by: null,
      rating: null,
      review: null,
      created_at: now,
      updated_at: now,
    });

    // increment total_sessions
    await tx
      .update(schema.customers)
      .set({
        total_sessions: sql`${schema.customers.total_sessions} + 1`,
        last_active_at: now,
        last_conversation_id: id,
      })
      .where(eq(schema.customers.id, params.customerId));
  });

  const rows = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .limit(1);
  return rows[0];
}

export async function findActiveConversation(
  customerId: string
): Promise<typeof schema.conversations.$inferSelect | null> {
  const rows = await db
    .select()
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.customer_id, customerId),
        inArray(schema.conversations.status, ["bot", "waiting", "active", "hold"])
      )
    )
    .orderBy(desc(schema.conversations.created_at))
    .limit(1);

  return rows.length > 0 ? rows[0] : null;
}

export async function getConversation(
  id: string
): Promise<(typeof schema.conversations.$inferSelect & { claimed_by_name?: string | null }) | null> {
  const rows = await db
    .select({
      conversation: schema.conversations,
      claimed_by_name: schema.users.name,
    })
    .from(schema.conversations)
    .leftJoin(schema.users, eq(schema.conversations.claimed_by, schema.users.id))
    .where(eq(schema.conversations.id, id))
    .limit(1);
  
  if (rows.length === 0) return null;
  return {
    ...rows[0].conversation,
    claimed_by_name: rows[0].claimed_by_name,
  };
}

export interface ConversationNote {
  conversation_id: string;
  note: string;
  rating: number | null;
  status: string;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * All notes recorded for a WhatsApp number, newest first. A "note" is the
 * `review` field on a conversation — the CS-authored resolution/context note.
 * Returns history across every conversation that number has had, so a CS can
 * see what previous CS recorded for the same customer.
 */
export async function getNotesByWaNumber(waNumber: string): Promise<ConversationNote[]> {
  const rows = await db
    .select({
      conversation_id: schema.conversations.id,
      note: schema.conversations.review,
      rating: schema.conversations.rating,
      status: schema.conversations.status,
      author_id: schema.conversations.claimed_by,
      author_name: schema.users.name,
      created_at: schema.conversations.created_at,
      updated_at: schema.conversations.updated_at,
    })
    .from(schema.conversations)
    .leftJoin(schema.users, eq(schema.conversations.claimed_by, schema.users.id))
    .where(
      and(
        eq(schema.conversations.wa_number, waNumber),
        sql`${schema.conversations.review} IS NOT NULL AND ${schema.conversations.review} != ''`
      )
    )
    .orderBy(desc(schema.conversations.updated_at));

  return rows.map((r) => ({
    conversation_id: r.conversation_id,
    note: r.note || "",
    rating: r.rating,
    status: r.status,
    author_id: r.author_id,
    author_name: r.author_name,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

/**
 * Set/replace the note (review) on a single conversation. Used by the chat
 * panel's "edit note" action so CS can update context at any time, not only at
 * resolve. Returns the updated row (or null if the conversation is gone).
 */
export async function updateConversationNote(
  id: string,
  note: string
): Promise<typeof schema.conversations.$inferSelect | null> {
  const now = new Date().toISOString();
  await db
    .update(schema.conversations)
    .set({ review: note, updated_at: now })
    .where(eq(schema.conversations.id, id));

  const rows = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

export async function updateConversationStatus(
  id: string,
  status: ConversationStatus
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(schema.conversations)
    .set({ status, updated_at: now })
    .where(eq(schema.conversations.id, id));
}

export async function getLatestConversation(
  customerId: string
): Promise<typeof schema.conversations.$inferSelect | null> {
  const rows = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.customer_id, customerId))
    .orderBy(desc(schema.conversations.created_at))
    .limit(1);

  return rows.length > 0 ? rows[0] : null;
}

export async function updateConversationRating(
  id: string,
  rating: number
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(schema.conversations)
    .set({ rating, updated_at: now })
    .where(eq(schema.conversations.id, id));
}

export async function claimConversation(
  conversationId: string,
  csId: string
): Promise<{ conversation: typeof schema.conversations.$inferSelect; claimed: boolean }> {
  const now = new Date().toISOString();

  // The guarded UPDATE (status IN bot/waiting) is the atomic gate: exactly one
  // concurrent claimer mutates the row, the rest affect 0 rows. `rowsAffected`
  // tells THIS caller whether it won, so the route can return 409 on a loss
  // instead of falsely reporting success with the winner's data.
  const result = await db
    .update(schema.conversations)
    .set({ claimed_by: csId, status: "active", warning_sent: false, updated_at: now })
    .where(
      and(
        eq(schema.conversations.id, conversationId),
        inArray(schema.conversations.status, ["bot", "waiting"])
      )
    );

  const claimed = (result as { rowsAffected?: number }).rowsAffected !== 0;

  const rows = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  return { conversation: rows[0], claimed };
}

export async function transferConversation(
  conversationId: string,
  fromCsId: string,
  toCsId: string
): Promise<typeof schema.conversations.$inferSelect> {
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.conversations)
      .set({ claimed_by: toCsId, warning_sent: false, updated_at: now })
      .where(
        and(
          eq(schema.conversations.id, conversationId),
          eq(schema.conversations.claimed_by, fromCsId)
        )
      );
  });

  const rows = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  return rows[0];
}

export async function resolveConversation(
  id: string,
  rating?: number,
  review?: string
): Promise<typeof schema.conversations.$inferSelect> {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: "resolved" as const, updated_at: now };
  if (rating !== undefined) update.rating = rating;
  if (review !== undefined) update.review = review;

  await db
    .update(schema.conversations)
    .set(update)
    .where(eq(schema.conversations.id, id));

  const rows = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id))
    .limit(1);
  return rows[0];
}

export async function addMessage(params: {
  conversationId: string;
  sender: "customer" | "bot" | "cs";
  csId?: string;
  content?: string;
  contentType?: "text" | "image" | "video" | "document";
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
  fileSize?: number;
  waMessageId?: string;
  replyToContent?: string;
  replyToSender?: string;
}): Promise<typeof schema.messages.$inferSelect> {
  const id = generateId();
  const now = new Date().toISOString();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.messages).values({
        id,
        conversation_id: params.conversationId,
        sender: params.sender,
        cs_id: params.csId || null,
        content: params.content || null,
        content_type: params.contentType || "text",
        media_url: params.mediaUrl || null,
        media_type: params.mediaType || null,
        file_name: params.fileName || null,
        file_size: params.fileSize || null,
        wa_message_id: params.waMessageId || null,
        reply_to_content: params.replyToContent || null,
        reply_to_sender: params.replyToSender || null,
        created_at: now,
      });

      await tx
        .update(schema.conversations)
        .set({ updated_at: now, warning_sent: false })
        .where(eq(schema.conversations.id, params.conversationId));

      // update customer last_active_at
      const convRows = await tx
        .select({ customer_id: schema.conversations.customer_id })
        .from(schema.conversations)
        .where(eq(schema.conversations.id, params.conversationId))
        .limit(1);
      if (convRows.length > 0) {
        await tx
          .update(schema.customers)
          .set({ last_active_at: now })
          .where(eq(schema.customers.id, convRows[0].customer_id));
      }
    });
  } catch (err: unknown) {
    // Unique constraint violation on wa_message_id (duplicate message)
    if (params.waMessageId && err && typeof err === "object" && "code" in err && (err as { code: string }).code === "SQLITE_UNIQUE") {
      const existing = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.wa_message_id, params.waMessageId))
        .limit(1);
      if (existing.length > 0) {
        return existing[0];
      }
    }
    throw err;
  }

  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.id, id))
    .limit(1);
  return rows[0];
}

export async function getMessages(params: {
  conversationId: string;
  cursor?: string;
  limit?: number;
  direction?: "older" | "newer";
}): Promise<{
  messages: (typeof schema.messages.$inferSelect & { cs_name?: string | null })[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const limit = params.limit || 30;

  const conditions: SQL[] = [
    eq(schema.messages.conversation_id, params.conversationId),
  ];

  if (params.cursor) {
    const cursorTime = params.cursor.split("|")[0];
    conditions.push(lt(schema.messages.created_at, cursorTime));
  }

  const rows = await db
    .select({
      message: schema.messages,
      cs_name: schema.users.name,
    })
    .from(schema.messages)
    .leftJoin(schema.users, eq(schema.messages.cs_id, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.messages.created_at))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const messagesRaw = rows.slice(0, limit).reverse();
  const messages = messagesRaw.map(row => ({
    ...row.message,
    cs_name: row.cs_name,
  }));

  let nextCursor: string | null = null;
  if (hasMore && messages.length > 0) {
    nextCursor = `${messages[0].created_at}|${messages[0].id}`;
  }

  return { messages, nextCursor, hasMore };
}

export async function getConversations(params: {
  cursor?: string;
  limit?: number;
  status?: ConversationStatus;
  claimedBy?: string;
}): Promise<{
  conversations: (typeof schema.conversations.$inferSelect & { claimed_by_name?: string | null })[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const limit = params.limit || 20;

  const conditions: SQL[] = [];

  if (params.status) {
    conditions.push(eq(schema.conversations.status, params.status));
  }

  if (params.claimedBy) {
    conditions.push(eq(schema.conversations.claimed_by, params.claimedBy));
  }

  const lastMsgAtSql = sql<string>`(
    SELECT MAX(created_at) FROM ${schema.messages} 
    WHERE ${schema.messages.conversation_id} = ${schema.conversations.id}
  )`;

  const lastMsgOrCreated = sql`COALESCE(${lastMsgAtSql}, ${schema.conversations.created_at})`;

  if (params.cursor) {
    conditions.push(lt(lastMsgOrCreated, params.cursor));
  }

  const rows = await db
    .select({
      conversation: schema.conversations,
      claimed_by_name: schema.users.name,
      last_msg_at: lastMsgOrCreated,
    })
    .from(schema.conversations)
    .leftJoin(schema.users, eq(schema.conversations.claimed_by, schema.users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(lastMsgOrCreated))
    .limit(limit + 1);

  const mappedRows = rows.map(r => ({
    ...r.conversation,
    claimed_by_name: r.claimed_by_name,
    last_msg_at: r.last_msg_at,
  }));

  const hasMore = mappedRows.length > limit;
  const conversations = mappedRows.slice(0, limit);

  let nextCursor: string | null = null;
  if (hasMore && conversations.length > 0) {
    nextCursor = (conversations[conversations.length - 1] as any).last_msg_at;
  }

  return { conversations, nextCursor, hasMore };
}

export async function getQueueCount(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.conversations)
    .where(eq(schema.conversations.status, "waiting"));

  return rows[0]?.count ?? 0;
}

export async function getCustomerByWaNumber(
  waNumber: string
): Promise<typeof schema.customers.$inferSelect | null> {
  const rows = await db
    .select()
    .from(schema.customers)
    .where(eq(schema.customers.wa_number, waNumber))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}
