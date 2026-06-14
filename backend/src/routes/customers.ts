import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { getCustomerByWaNumber } from "../services/conversation.js";

const router = Router();

router.use(authenticate);

router.get("/:wa_number", async (req, res) => {
  try {
    const customer = await getCustomerByWaNumber(req.params.wa_number);
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    res.json({
      id: customer.id,
      wa_number: customer.wa_number,
      display_name: customer.display_name,
      total_sessions: customer.total_sessions,
      last_summary: customer.last_summary,
      last_active_at: customer.last_active_at,
      created_at: customer.created_at,
    });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
