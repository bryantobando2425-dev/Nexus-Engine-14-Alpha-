import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { momentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const router: IRouter = Router();

router.post("/", async (req, res) => {
  try {
    const { runId, playerId, imageUrl, promptUsed, contextSnapshot, ingameDate } = req.body;
    if (!runId || !playerId || !imageUrl || !promptUsed || !contextSnapshot || !ingameDate) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [moment] = await db.insert(momentsTable).values({
      runId, playerId, imageUrl, promptUsed, contextSnapshot, ingameDate,
    }).returning();

    res.status(201).json(moment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save moment" });
  }
});

router.get("/player/:playerId", async (req, res) => {
  try {
    const { playerId } = req.params;
    const { runId } = req.query;

    const conditions = [eq(momentsTable.playerId, playerId)];
    if (runId) conditions.push(eq(momentsTable.runId, runId as string));

    const moments = await db.select().from(momentsTable)
      .where(and(...conditions))
      .orderBy(desc(momentsTable.createdAt));

    res.json(moments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get moments" });
  }
});

router.put("/:momentId/favorite", async (req, res) => {
  try {
    const { momentId } = req.params;
    const { isFavorite } = req.body;
    const [moment] = await db.update(momentsTable)
      .set({ isFavorite: !!isFavorite })
      .where(eq(momentsTable.id, momentId))
      .returning();
    if (!moment) return res.status(404).json({ error: "Moment not found" });
    res.json(moment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update moment" });
  }
});

export default router;
