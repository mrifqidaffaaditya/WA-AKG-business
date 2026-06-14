// @ts-nocheck
import { Router } from "express";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { eq, and, sql, desc } from "drizzle-orm";
import { generateId } from "../utils/id.js";
import { hashPassword, revokeAllUserTokens } from "../services/auth.js";
import { createAuditLog } from "../utils/audit.js";
import { previewStock, clearStockCache, syncStockNow } from "../services/stock.js";
import { logger } from "../utils/logger.js";

const router = Router();

router.use(authenticate);
router.use(requireRole("super_admin", "admin"));

// ── Bot Config ──────────────────────────────────────────────

router.get("/bot-config", async (_req, res) => {
  try {
    const rows = await db.select().from(schema.botConfig).limit(1);
    if (rows.length === 0) {
      res.status(404).json({ error: "Bot config not found" });
      return;
    }
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/bot-config", async (req: AuthRequest, res) => {
  try {
    const existing = await db.select().from(schema.botConfig).limit(1);
    if (existing.length === 0) {
      res.status(404).json({ error: "Bot config not found" });
      return;
    }

    const {
      persona_name,
      system_prompt,
      business_info,
      escalation_keywords,
      session_timeout_mins,
      auto_close_enabled,
    } = req.body;

    const updates: Record<string, unknown> = {
      updated_by: req.user!.sub,
      updated_at: new Date().toISOString(),
    };

    if (persona_name !== undefined) updates.persona_name = persona_name;
    if (system_prompt !== undefined) updates.system_prompt = system_prompt;
    if (business_info !== undefined) updates.business_info = business_info;
    if (escalation_keywords !== undefined) updates.escalation_keywords = escalation_keywords;
    if (session_timeout_mins !== undefined) updates.session_timeout_mins = session_timeout_mins;
    if (auto_close_enabled !== undefined) updates.auto_close_enabled = auto_close_enabled;

    await db
      .update(schema.botConfig)
      .set(updates)
      .where(eq(schema.botConfig.id, existing[0].id));

    await createAuditLog({
      userId: req.user!.sub,
      action: "update_bot_config",
      entityType: "bot_config",
      entityId: existing[0].id,
    });

    const updated = await db.select().from(schema.botConfig).limit(1);
    res.json(updated[0]);
  } catch (err) {
    logger.error("[admin] Bot config error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Stock Config ────────────────────────────────────────────

router.get("/stock-config", async (_req, res) => {
  try {
    const rows = await db.select().from(schema.stockConfig).limit(1);
    if (rows.length === 0) {
      res.status(404).json({ error: "Stock config not found" });
      return;
    }
    res.json(rows[0]);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/stock-config", async (req: AuthRequest, res) => {
  try {
    const existing = await db.select().from(schema.stockConfig).limit(1);
    if (existing.length === 0) {
      res.status(404).json({ error: "Stock config not found" });
      return;
    }

    const { source_type, config_json, is_active } = req.body;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (source_type !== undefined) updates.source_type = source_type;
    if (config_json !== undefined) updates.config_json = JSON.stringify(config_json);
    if (is_active !== undefined) updates.is_active = is_active;

    await db
      .update(schema.stockConfig)
      .set(updates)
      .where(eq(schema.stockConfig.id, existing[0].id));

    clearStockCache();
    await syncStockNow();

    await createAuditLog({
      userId: req.user!.sub,
      action: "update_stock_config",
      entityType: "stock_config",
      entityId: existing[0].id,
    });

    const updated = await db.select().from(schema.stockConfig).limit(1);
    res.json(updated[0]);
  } catch (err) {
    logger.error("[admin] Stock config error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/stock/preview", async (_req, res) => {
  try {
    const data = await previewStock();
    res.json(data);
  } catch (err) {
    logger.error("[admin] Stock preview error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Users ───────────────────────────────────────────────────

router.get("/users", async (_req, res) => {
  try {
    const users = await db
      .select()
      .from(schema.users)
      .orderBy(schema.users.created_at);
    res.json(
      users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        is_active: u.is_active,
        created_at: u.created_at,
      }))
    );
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/users", async (req: AuthRequest, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "name, email, password are required" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "Email already exists" });
      return;
    }

    const id = generateId();
    const now = new Date().toISOString();
    const hashed = await hashPassword(password);

    await db.insert(schema.users).values({
      id,
      name,
      email,
      password_hash: hashed,
      role: role || "cs",
      is_active: true,
      created_at: now,
    });

    await createAuditLog({
      userId: req.user!.sub,
      action: "create_user",
      entityType: "users",
      entityId: id,
    });

    res.status(201).json({ id, name, email, role: role || "cs" });
  } catch (err) {
    logger.error("[admin] Create user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/users/:id", async (req: AuthRequest, res) => {
  try {
    const { name, email, password, role, is_active } = req.body;
    const userId = req.params.id;

    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (existing.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (is_active !== undefined) updates.is_active = is_active;
    if (password) {
      if (password.length < 6) {
        res.status(400).json({ error: "Password must be at least 6 characters" });
        return;
      }
      updates.password_hash = await hashPassword(password);
      // Revoke all sessions when password is changed
      await revokeAllUserTokens(userId);
    }

    // Check email uniqueness if changing email
    if (email !== undefined && email !== existing[0].email) {
      const emailExists = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);
      if (emailExists.length > 0) {
        res.status(409).json({ error: "Email already exists" });
        return;
      }
    }

    await db
      .update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, userId));

    await createAuditLog({
      userId: req.user!.sub,
      action: "update_user",
      entityType: "users",
      entityId: userId,
    });

    res.json({ message: "User updated" });
  } catch (err) {
    logger.error("[admin] Update user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/users/:id", async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;
    if (userId === req.user!.sub) {
      res.status(400).json({ error: "Cannot delete yourself" });
      return;
    }

    // Revoke all sessions before deleting
    await revokeAllUserTokens(userId);
    await db.delete(schema.users).where(eq(schema.users.id, userId));

    await createAuditLog({
      userId: req.user!.sub,
      action: "delete_user",
      entityType: "users",
      entityId: userId,
    });

    res.json({ message: "User deleted" });
  } catch (err) {
    logger.error("[admin] Delete user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Dashboard Stats ───────────────────────────────────────────

router.get("/dashboard-stats", async (_req, res) => {
  try {
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
      .limit(5);

    res.json({
      totalConversations,
      activeConversations: conversationsByStatus["active"] || 0,
      waitingConversations: conversationsByStatus["waiting"] || 0,
      resolvedConversations: conversationsByStatus["resolved"] || 0,
      botConversations: conversationsByStatus["bot"] || 0,
      totalCs: csCount[0]?.count || 0,
      totalCustomers: customerCount[0]?.count || 0,
      todayMessages: todayMessages[0]?.count || 0,
      avgRating: ratingRows[0]?.avg || 0,
      recentReviews,
      conversationsByStatus,
    });
  } catch (err) {
    logger.error("[admin] Dashboard stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Audit Log ───────────────────────────────────────────────

router.get("/audit-log", async (req, res) => {
  try {
    const limit = parseInt((req.query.limit as string) || "50", 10);
    const logs = await db
      .select()
      .from(schema.auditLog)
      .limit(limit)
      .orderBy(schema.auditLog.created_at);

    res.json(logs);
  } catch (err) {
    logger.error("[admin] Audit log error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
