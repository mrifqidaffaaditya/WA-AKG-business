import { Router } from "express";
import { authenticate, AuthRequest } from "../middleware/auth.js";
import {
  addSubscription,
  removeSubscription,
  getUserPreferences,
  updateUserPreference,
} from "../services/notifications.js";
import { config } from "../config.js";

const router = Router();

router.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: config.vapid.publicKey });
});

router.use(authenticate);

router.post("/subscribe", async (req: AuthRequest, res) => {
  try {
    const { endpoint, keys, userAgent } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      res.status(400).json({ error: "Invalid subscription payload" });
      return;
    }

    await addSubscription({
      userId: req.user!.sub,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
    });

    res.json({ message: "Subscribed" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/unsubscribe", async (req: AuthRequest, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      res.status(400).json({ error: "endpoint is required" });
      return;
    }
    await removeSubscription(endpoint, req.user!.sub);
    res.json({ message: "Unsubscribed" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/preferences", async (req: AuthRequest, res) => {
  try {
    const prefs = await getUserPreferences(req.user!.sub);
    res.json(prefs);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/preferences", async (req: AuthRequest, res) => {
  try {
    const { notif_type, is_enabled } = req.body;
    if (!notif_type || typeof is_enabled !== "boolean") {
      res.status(400).json({ error: "notif_type and is_enabled are required" });
      return;
    }
    await updateUserPreference(req.user!.sub, notif_type, is_enabled);
    res.json({ message: "Preference updated" });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
