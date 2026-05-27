import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { playersTable, runsTable, runEventsTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";

const router: IRouter = Router();

router.post("/", async (req, res) => {
  try {
    const { email, username, settings } = req.body;
    if (!username) return res.status(400).json({ error: "username required" });

    if (email) {
      const existing = await db.select().from(playersTable).where(eq(playersTable.email, email)).limit(1);
      if (existing.length > 0) {
        return res.json(existing[0]);
      }
    }

    const [player] = await db.insert(playersTable).values({
      email: email ?? null,
      username,
      settings: settings ?? {},
    }).returning();

    res.json(player);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create player" });
  }
});

router.get("/:playerId", async (req, res) => {
  try {
    const { playerId } = req.params;
    const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId)).limit(1);
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json(player);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get player" });
  }
});

router.put("/:playerId", async (req, res) => {
  try {
    const { playerId } = req.params;
    const { username, settings } = req.body;
    const [player] = await db.update(playersTable)
      .set({ ...(username ? { username } : {}), ...(settings ? { settings } : {}) })
      .where(eq(playersTable.id, playerId))
      .returning();
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json(player);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update player" });
  }
});

router.get("/:playerId/stats", async (req, res) => {
  try {
    const { playerId } = req.params;
    const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId)).limit(1);
    if (!player) return res.status(404).json({ error: "Player not found" });

    const runs = await db.select().from(runsTable).where(eq(runsTable.playerId, playerId));
    const completedRuns = runs.filter(r => r.status === "completed").length;
    const abandonedRuns = runs.filter(r => r.status === "abandoned").length;

    const deathsByCause: Record<string, number> = {};
    const erasExplored: string[] = [];

    for (const run of runs) {
      if (run.endCause) {
        deathsByCause[run.endCause] = (deathsByCause[run.endCause] ?? 0) + 1;
      }
      const era = (run.eraConfig as any)?.eraName;
      if (era && !erasExplored.includes(era)) {
        erasExplored.push(era);
      }
    }

    res.json({
      totalRuns: player.totalRuns,
      completedRuns,
      abandonedRuns,
      totalPlaytimeMinutes: player.totalPlaytimeMinutes,
      totalInGameYears: 0,
      deathsByCause,
      erasExplored,
      mostUsedVoice: null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get stats" });
  }
});

export default router;
