import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { runsTable, playersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

router.post("/", async (req, res) => {
  try {
    const { playerId, gameId, eraConfig, character } = req.body;
    if (!playerId || !gameId || !eraConfig || !character) {
      return res.status(400).json({ error: "playerId, gameId, eraConfig, character required" });
    }

    const [run] = await db.insert(runsTable).values({
      playerId,
      gameId,
      status: "active",
      eraConfig,
      character,
    }).returning();

    await db.update(playersTable)
      .set({ totalRuns: sql`${playersTable.totalRuns} + 1` })
      .where(eq(playersTable.id, playerId));

    res.status(201).json(run);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create run" });
  }
});

router.get("/player/:playerId", async (req, res) => {
  try {
    const { playerId } = req.params;
    const runs = await db.select().from(runsTable)
      .where(eq(runsTable.playerId, playerId))
      .orderBy(sql`${runsTable.startedAt} DESC`);
    res.json(runs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get runs" });
  }
});

router.get("/:runId", async (req, res) => {
  try {
    const { runId } = req.params;
    const [run] = await db.select().from(runsTable).where(eq(runsTable.id, runId)).limit(1);
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.json(run);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get run" });
  }
});

router.put("/:runId", async (req, res) => {
  try {
    const { runId } = req.params;
    const { status, endCause, finalState, summary, character } = req.body;
    const [run] = await db.update(runsTable)
      .set({
        ...(status ? { status } : {}),
        ...(endCause ? { endCause } : {}),
        ...(finalState ? { finalState } : {}),
        ...(summary ? { summary } : {}),
        ...(character ? { character } : {}),
      })
      .where(eq(runsTable.id, runId))
      .returning();
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.json(run);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update run" });
  }
});

router.post("/:runId/end", async (req, res) => {
  try {
    const { runId } = req.params;
    const { endCause, finalState } = req.body;
    if (!endCause) return res.status(400).json({ error: "endCause required" });

    const [run] = await db.update(runsTable)
      .set({
        status: "completed",
        endCause,
        endedAt: new Date(),
        ...(finalState ? { finalState } : {}),
      })
      .where(eq(runsTable.id, runId))
      .returning();

    if (!run) return res.status(404).json({ error: "Run not found" });
    res.json(run);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to end run" });
  }
});

export default router;
