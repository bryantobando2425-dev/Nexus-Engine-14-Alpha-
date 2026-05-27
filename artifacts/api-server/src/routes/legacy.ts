import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { legacyEchoesTable, runEventsTable, runsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

const ECHO_TYPE_MAP: Record<string, string[]> = {
  major_death: ['character_descendant', 'npc_legend'],
  discovery: ['hidden_object', 'historical_event', 'artifact'],
  first_visit_unique_location: ['location_ruin', 'geographical_change'],
  catastrophic_event: ['historical_event', 'oral_tradition', 'written_record'],
  significant_npc_encounter: ['npc_legend', 'bloodline_trait'],
  era_changing_decision: ['historical_event', 'written_record', 'oral_tradition'],
  personal_milestone: ['artifact', 'hidden_object', 'bloodline_trait'],
};

function determineEchoType(eventType: string, eventData: Record<string, any>): string {
  const candidates = ECHO_TYPE_MAP[eventType] || ['historical_event'];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function buildEchoData(event: any, run: any) {
  const description = event.narrativeSnapshot?.slice(0, 200) + '...';
  return {
    originalContext: event.narrativeSnapshot,
    currentManifestations: [{
      description: `Traces of ${run.character?.name || 'someone'} who lived in ${run.eraConfig?.eraName || 'another time'}: ${description}`,
      discoveryHint: event.legacyWeight < 0.3 ? `Look for echoes of ${run.eraConfig?.eraName || 'the past'} here` : undefined,
      location: event.location || undefined,
    }],
  };
}

function computeDiscoveryDifficulty(event: any): number {
  if (event.isHidden) return Math.max(0.8, event.hiddenDifficulty ?? 0.9);
  if (event.legacyWeight > 0.8) return 0.2;
  if (event.legacyWeight > 0.6) return 0.4;
  if (event.legacyWeight > 0.4) return 0.55;
  return 0.7;
}

router.get("/echoes/player/:playerId", async (req, res) => {
  try {
    const { playerId } = req.params;
    const echoes = await db.select().from(legacyEchoesTable)
      .where(eq(legacyEchoesTable.playerId, playerId));
    res.json(echoes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get echoes" });
  }
});

router.post("/echoes/run/:runId/resolve", async (req, res) => {
  try {
    const { runId } = req.params;
    const { playerId, gameId, eraYear, mapSeed } = req.body;
    if (!playerId || !gameId) return res.status(400).json({ error: "playerId, gameId required" });

    const allEchoes = await db.select().from(legacyEchoesTable)
      .where(and(
        eq(legacyEchoesTable.playerId, playerId),
        eq(legacyEchoesTable.gameId, gameId),
        eq(legacyEchoesTable.isDiscovered, false),
      ));

    const available = allEchoes.filter(echo => {
      if (echo.discoveryDifficulty > 0.9) return Math.random() < 0.05;
      if (echo.discoveryDifficulty > 0.7) return Math.random() < 0.2;
      if (echo.discoveryDifficulty > 0.5) return Math.random() < 0.5;
      return Math.random() < 0.8;
    });

    res.json(available.slice(0, 10));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to resolve echoes" });
  }
});

router.post("/process/:runId", async (req, res) => {
  try {
    const { runId } = req.params;

    const events = await db.select().from(runEventsTable)
      .where(eq(runEventsTable.runId, runId));

    const [runs] = await db.select().from(runsTable).where(eq(runsTable.id, runId)).limit(1);

    if (!runs) return res.status(404).json({ error: "Run not found" });

    const significantEvents = events.filter(e => e.legacyWeight >= 0.3);
    const createdEchoes = [];

    for (const event of significantEvents) {
      const echoType = determineEchoType(event.eventType, event.eventData as Record<string, any>);
      const echoData = buildEchoData(event, runs);
      const discoveryDifficulty = computeDiscoveryDifficulty(event);

      const [echo] = await db.insert(legacyEchoesTable).values({
        sourceRunId: runId,
        playerId: runs.playerId,
        gameId: runs.gameId,
        echoType,
        echoData,
        discoveryDifficulty,
        isDiscovered: false,
      }).returning();

      createdEchoes.push(echo);
    }

    res.json({ echoesCreated: createdEchoes.length, echoes: createdEchoes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to process legacy" });
  }
});

export default router;
