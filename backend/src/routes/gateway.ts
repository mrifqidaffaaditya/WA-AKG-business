import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  getConnectionStatus,
  disconnectWa,
  connectWa,
  resetWaSession,
  requestWaPairingCode,
  waEvents,
} from "../services/waGateway.js";

const router = Router();

router.use(authenticate);
router.use(requireRole("super_admin", "admin"));

router.get("/status", (_req, res) => {
  res.json(getConnectionStatus());
});

router.get("/qr", (_req, res) => {
  const status = getConnectionStatus();
  res.json({
    qr: status.qr,
    status: status.status,
    pairingCode: status.pairingCode,
    registered: status.registered,
  });
});

router.post("/pairing-code", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber || typeof phoneNumber !== "string") {
      res.status(400).json({ error: "Nomor telepon wajib diisi" });
      return;
    }
    const code = await requestWaPairingCode(phoneNumber);
    res.json({ code });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Gagal meminta kode pairing" });
  }
});

router.post("/disconnect", async (_req, res) => {
  await disconnectWa();
  res.json({ message: "Disconnected" });
});

router.post("/connect", async (_req, res) => {
  connectWa(true).catch(() => {});
  res.json({ message: "Reconnecting..." });
});

router.post("/reset", async (_req, res) => {
  try {
    await resetWaSession();
    res.json({ message: "Sesi WhatsApp berhasil direset dan dihapus" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal mereset sesi WhatsApp" });
  }
});

router.post("/logout", async (_req, res) => {
  try {
    await resetWaSession();
    res.json({ message: "Sesi WhatsApp berhasil di-logout dan dihapus" });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Gagal logout sesi WhatsApp" });
  }
});

export default router;
