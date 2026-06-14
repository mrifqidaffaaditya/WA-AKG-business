import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.js";
import { getConnectionStatus, disconnectWa, connectWa, waEvents } from "../services/waGateway.js";

const router = Router();

router.use(authenticate);
router.use(requireRole("super_admin", "admin"));

router.get("/status", (_req, res) => {
  res.json(getConnectionStatus());
});

router.get("/qr", (_req, res) => {
  const status = getConnectionStatus();
  res.json({ qr: status.qr, status: status.status });
});

router.post("/disconnect", async (_req, res) => {
  await disconnectWa();
  res.json({ message: "Disconnected" });
});

router.post("/connect", async (_req, res) => {
  connectWa().catch(() => {});
  res.json({ message: "Reconnecting..." });
});

export default router;
