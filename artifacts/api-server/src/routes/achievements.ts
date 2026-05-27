import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { achievementsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/player/:playerId", async (req, res) => {
  try {
    const { playerId } = req.params;
    const achievements = await db.select().from(achievementsTable)
      .where(eq(achievementsTable.playerId, playerId));
    res.json(achievements);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get achievements" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { playerId, achievementKey, runId, metadata } = req.body;
    if (!playerId || !achievementKey) return res.status(400).json({ error: "playerId and achievementKey required" });

    const existing = await db.select().from(achievementsTable)
      .where(and(
        eq(achievementsTable.playerId, playerId),
        eq(achievementsTable.achievementKey, achievementKey),
      )).limit(1);

    if (existing.length > 0) return res.status(201).json(existing[0]);

    const [achievement] = await db.insert(achievementsTable).values({
      playerId, achievementKey, runId: runId ?? null, metadata: metadata ?? {},
    }).returning();

    res.status(201).json(achievement);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to unlock achievement" });
  }
});

export default router;
