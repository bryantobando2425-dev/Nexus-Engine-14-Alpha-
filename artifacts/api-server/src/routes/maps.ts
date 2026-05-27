import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { worldMapsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.post("/", async (req, res) => {
  try {
    const { runId, mapSeed, terrainData, pointsOfInterest, legacyMarkers } = req.body;
    if (!runId || !mapSeed || !terrainData || !pointsOfInterest || !legacyMarkers) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const [map] = await db.insert(worldMapsTable).values({
      runId, mapSeed, terrainData, pointsOfInterest, legacyMarkers,
    }).returning();

    res.status(201).json(map);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save map" });
  }
});

router.get("/run/:runId", async (req, res) => {
  try {
    const { runId } = req.params;
    const [map] = await db.select().from(worldMapsTable)
      .where(eq(worldMapsTable.runId, runId)).limit(1);
    if (!map) return res.status(404).json({ error: "Map not found" });
    res.json(map);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get map" });
  }
});

router.put("/run/:runId", async (req, res) => {
  try {
    const { runId } = req.params;
    const { terrainData, pointsOfInterest, legacyMarkers } = req.body;
    const [map] = await db.update(worldMapsTable)
      .set({
        ...(terrainData ? { terrainData } : {}),
        ...(pointsOfInterest ? { pointsOfInterest } : {}),
        ...(legacyMarkers ? { legacyMarkers } : {}),
      })
      .where(eq(worldMapsTable.runId, runId))
      .returning();
    if (!map) return res.status(404).json({ error: "Map not found" });
    res.json(map);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update map" });
  }
});

export default router;
