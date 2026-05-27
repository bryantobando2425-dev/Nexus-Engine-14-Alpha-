import { Router, type IRouter } from "express";
import { kvGet, kvSet } from "../lib/replitKv";

const router: IRouter = Router();

router.post("/save", async (req, res) => {
  try {
    const { playerId, state } = req.body;
    if (!playerId || !state) return res.status(400).json({ error: "playerId and state required" });
    const savedAt = Date.now();
    await kvSet(`nexus_state_${playerId}`, JSON.stringify({ ...state, _savedAt: savedAt }));
    res.json({ ok: true, savedAt });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Save failed" });
  }
});

router.get("/load/:playerId", async (req, res) => {
  try {
    const { playerId } = req.params;
    const raw = await kvGet(`nexus_state_${playerId}`);
    if (!raw) return res.json({ ok: false, state: null });
    res.json({ ok: true, state: JSON.parse(raw) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Load failed" });
  }
});

export default router;
