import { pgTable, text, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { runsTable } from "./runs";

export const worldMapsTable = pgTable("world_maps", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").references(() => runsTable.id).notNull(),
  mapSeed: text("map_seed").notNull(),
  terrainData: jsonb("terrain_data").notNull().$type<Record<string, unknown>>(),
  pointsOfInterest: jsonb("points_of_interest").notNull().$type<Record<string, unknown>>(),
  legacyMarkers: jsonb("legacy_markers").notNull().$type<Record<string, unknown>>(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

export const insertWorldMapSchema = createInsertSchema(worldMapsTable).omit({ id: true, generatedAt: true });
export type InsertWorldMap = z.infer<typeof insertWorldMapSchema>;
export type WorldMap = typeof worldMapsTable.$inferSelect;
