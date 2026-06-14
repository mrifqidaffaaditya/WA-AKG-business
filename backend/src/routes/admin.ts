import { Router } from "express";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { eq, and, sql, desc } from "drizzle-orm";
import { generateId } from "../utils/id.js";
import { hashPassword, revokeAllUserTokens } from "../services/auth.js";
import { adminMutationRateLimit } from "../middleware/rateLimit.js";
import { config } from "../config.js";
import { createAuditLog } from "../utils/audit.js";
import { previewStock, clearStockCache, syncStockNow } from "../services/stock.js";
import { logger } from "../utils/logger.js";
import { getDashboardStats } from "../services/dashboard.js";
import { getCsConfig, updateCsConfig } from "../services/csConfig.js";
import { getActiveUserIds } from "../ws/index.js";

const ALLOWED_BOT_CONFIG_FIELDS = [
  "persona_name",
  "system_prompt",
  "business_info",
  "escalation_keywords",
  "session_timeout_mins",
  "session_timeout_warning_mins",
  "auto_close_enabled",
];

function validateBotConfigFields(body: Record<string, unknown>): string | null {
  const unknownFields = Object.keys(body).filter((k) => !ALLOWED_BOT_CONFIG_FIELDS.includes(k));
  if (unknownFields.length > 0) {
    return `Unknown field(s): ${unknownFields.join(", ")}`;
  }
  if (body.session_timeout_mins !== undefined && (typeof body.session_timeout_mins !== "number" || body.session_timeout_mins < 1)) {
    return "session_timeout_mins must be a positive number";
  }
  if (body.session_timeout_warning_mins !== undefined && (typeof body.session_timeout_warning_mins !== "number" || body.session_timeout_warning_mins < 0)) {
    return "session_timeout_warning_mins must be a non-negative number";
  }
  if (body.auto_close_enabled !== undefined && typeof body.auto_close_enabled !== "boolean") {
    return "auto_close_enabled must be a boolean";
  }
  if (body.persona_name !== undefined && typeof body.persona_name !== "string") {
    return "persona_name must be a string";
  }
  if (body.system_prompt !== undefined && typeof body.system_prompt !== "string") {
    return "system_prompt must be a string";
  }
  if (body.business_info !== undefined && typeof body.business_info !== "string") {
    return "business_info must be a string";
  }
  if (body.escalation_keywords !== undefined && typeof body.escalation_keywords !== "string" && !Array.isArray(body.escalation_keywords)) {
    return "escalation_keywords must be a string or an array";
  }
  return null;
}

const router = Router();

router.use(authenticate);
router.use(requireRole("super_admin", "admin"));
if (config.rateLimitEnabled) router.use(adminMutationRateLimit);

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
    const validationError = validateBotConfigFields(req.body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

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
      session_timeout_warning_mins,
      auto_close_enabled,
    } = req.body;

    // Validate relationship: warning mins must be less than timeout mins
    const finalTimeoutMins = session_timeout_mins !== undefined ? session_timeout_mins : existing[0].session_timeout_mins;
    const finalWarningMins = session_timeout_warning_mins !== undefined ? session_timeout_warning_mins : existing[0].session_timeout_warning_mins;

    if (finalWarningMins >= finalTimeoutMins && finalWarningMins > 0) {
      res.status(400).json({ error: "Waktu peringatan harus lebih kecil dari waktu timeout sesi" });
      return;
    }

    const updates: Record<string, unknown> = {
      updated_by: req.user!.sub,
      updated_at: new Date().toISOString(),
    };

    if (persona_name !== undefined) updates.persona_name = persona_name;
    if (system_prompt !== undefined) updates.system_prompt = system_prompt;
    if (business_info !== undefined) updates.business_info = business_info;
    if (escalation_keywords !== undefined) {
      updates.escalation_keywords = Array.isArray(escalation_keywords)
        ? escalation_keywords.join(",")
        : escalation_keywords;
    }
    if (session_timeout_mins !== undefined) updates.session_timeout_mins = session_timeout_mins;
    if (session_timeout_warning_mins !== undefined) updates.session_timeout_warning_mins = session_timeout_warning_mins;
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

// ── CS Config ─────────────────────────────────────────────────

router.get("/cs-config", async (_req, res) => {
  try {
    const config = await getCsConfig();
    res.json(config);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/cs-config", async (req: AuthRequest, res) => {
  try {
    const updated = await updateCsConfig(req.body);
    
    await createAuditLog({
      userId: req.user!.sub,
      action: "update_cs_config",
      entityType: "cs_config",
      entityId: "system",
    });

    res.json(updated);
  } catch (err) {
    logger.error("[admin] CS config error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Stock Config (super_admin only ── contains credentials) ──

const stockRouter = Router();
stockRouter.use(authenticate);
stockRouter.use(requireRole("super_admin"));

stockRouter.get("/", async (_req, res) => {
  try {
    const rows = await db.select().from(schema.stockConfig).limit(1);
    if (rows.length === 0) {
      res.status(404).json({ error: "Stock config not found" });
      return;
    }
    const row = { ...rows[0] };
    // Mask credential fields in config_json for defense-in-depth
    if (row.config_json) {
      try {
        const parsed: Record<string, unknown> =
          typeof row.config_json === "string"
            ? JSON.parse(row.config_json)
            : {};
        const SENSITIVE_KEYS = ["password", "api_key", "apiKey", "apikey", "secret", "credentials", "token"];
        for (const key of Object.keys(parsed)) {
          if (SENSITIVE_KEYS.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
            parsed[key] = "***";
          }
        }
        row.config_json = JSON.stringify(parsed) as any;
      } catch (parseErr) {
        logger.error("[admin] Failed to parse config_json for masking:", parseErr);
      }
    }
    res.json(row);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

stockRouter.put("/", async (req: AuthRequest, res) => {
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

router.use("/stock-config", stockRouter);

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
    const activeUserIds = getActiveUserIds();
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
        is_online: activeUserIds.includes(u.id),
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
    const userId = req.params.id as string;

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
    const userId = req.params.id as string;
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
    const stats = await getDashboardStats();
    res.json(stats);
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
      .select({
        id: schema.auditLog.id,
        user_id: schema.auditLog.user_id,
        user_name: schema.users.name,
        action: schema.auditLog.action,
        entity_type: schema.auditLog.entity_type,
        entity_id: schema.auditLog.entity_id,
        details: schema.auditLog.details,
        created_at: schema.auditLog.created_at,
      })
      .from(schema.auditLog)
      .leftJoin(schema.users, eq(schema.auditLog.user_id, schema.users.id))
      .orderBy(desc(schema.auditLog.created_at))
      .limit(limit);

    res.json(logs);
  } catch (err) {
    logger.error("[admin] Audit log error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── CS Stats ─────────────────────────────────────────────────

router.get("/cs-stats", async (_req, res) => {
  try {
    const activeUserIds = getActiveUserIds();
    const users = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.is_active, true));

    const rows = await db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(eq(schema.users.is_active, true));

    const conversations = await db
      .select()
      .from(schema.conversations);

    const csUsers = rows.filter((u) => u.role !== "super_admin");

    const result = csUsers.map((u) => {
      const userConvs = conversations.filter((c) => c.claimed_by === u.id);
      const resolved = userConvs.filter((c) => c.status === "resolved");
      const active = userConvs.filter((c) => c.status === "active");
      const ratings = resolved.filter((c) => c.rating != null).map((c) => c.rating as number);
      const avgRating = ratings.length > 0
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
        : null;

      return {
        id: u.id,
        name: u.name,
        role: u.role,
        is_online: activeUserIds.includes(u.id),
        total_claimed: userConvs.length,
        total_resolved: resolved.length,
        avg_rating: avgRating,
        active_count: active.length,
      };
    });

    result.sort((a, b) => b.total_resolved - a.total_resolved);

    res.json(result);
  } catch (err) {
    logger.error("[admin] CS stats error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
