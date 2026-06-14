import { Router } from "express";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  storeRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  verifyRefreshToken,
  isRefreshTokenValid,
} from "../services/auth.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import { loginRateLimit } from "../middleware/rateLimit.js";
import { createAuditLog } from "../utils/audit.js";
import { generateId } from "../utils/id.js";

const router = Router();

router.post("/login", loginRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const users = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (users.length === 0) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const user = users[0];

    if (!user.is_active) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const payload = { sub: user.id, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await storeRefreshToken(user.id, refreshToken);

    res.cookie("refresh_token", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/auth",
    });

    res.json({
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.refresh_token || req.body?.refreshToken || req.body?.refresh_token;

    if (!token) {
      res.status(401).json({ error: "Refresh token missing" });
      return;
    }

    const valid = await isRefreshTokenValid(token);
    if (!valid) {
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }

    const payload = verifyRefreshToken(token);
    const newAccessToken = generateAccessToken({
      sub: payload.sub,
      role: payload.role,
    });

    res.json({ accessToken: newAccessToken });
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.post("/logout", authenticate, async (req: AuthRequest, res) => {
  try {
    const token = req.cookies?.refresh_token || req.body?.refreshToken || req.body?.refresh_token;

    if (token) {
      await revokeRefreshToken(token);
    }

    res.clearCookie("refresh_token", { path: "/api/auth" });
    res.json({ message: "Logged out" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/me", authenticate, async (req: AuthRequest, res) => {
  try {
    const users = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, req.user!.sub))
      .limit(1);

    if (users.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const u = users[0];
    res.json({
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      },
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/profile", authenticate, async (req: AuthRequest, res) => {
  try {
    const { name, password } = req.body;
    const updates: Record<string, unknown> = {};

    if (name) updates.name = name;
    if (password) {
      updates.password_hash = await hashPassword(password);
      await revokeAllUserTokens(req.user!.sub);
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(schema.users)
        .set(updates)
        .where(eq(schema.users.id, req.user!.sub));
    }

    await createAuditLog({
      userId: req.user!.sub,
      action: "profile_update",
      entityType: "users",
      entityId: req.user!.sub,
    });

    res.json({ message: "Profile updated" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
