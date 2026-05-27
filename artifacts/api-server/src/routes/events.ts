import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { runEventsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";

const router: IRouter = Router();

router.post("/", async (req, res) => {
  try {
    const { runId, timestampIngame, eventType, eventData, narrativeSnapshot, legacyWeight, location, isHidden, hiddenDifficulty } = req.body;
    if (!runId || !timestampIngame || !eventType || !eventData || !narrativeSnapshot) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [event] = await db.insert(runEventsTable).values({
      runId,
      timestampIngame,
      eventType,
      eventData,
      narrativeSnapshot,
      legacyWeight: legacyWeight ?? 0,
      location: location ?? null,
      isHidden: isHidden ?? false,
      hiddenDifficulty: hiddenDifficulty ?? null,
    }).returning();

    res.status(201).json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create event" });
  }
});

router.get("/run/:runId", async (req, res) => {
  try {
    const { runId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const events = await db.select().from(runEventsTable)
      .where(eq(runEventsTable.runId, runId))
      .orderBy(desc(runEventsTable.timestampReal))
      .limit(limit)
      .offset(offset);

    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get events" });
  }
});

export default router;
