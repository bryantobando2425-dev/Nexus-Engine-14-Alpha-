import { pgTable, text, timestamp, jsonb, uuid, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { runsTable } from "./runs";

export const runEventsTable = pgTable("run_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").references(() => runsTable.id).notNull(),
  timestampIngame: text("timestamp_ingame").notNull(),
  timestampReal: timestamp("timestamp_real").defaultNow().notNull(),
  eventType: text("event_type").notNull(),
  eventData: jsonb("event_data").notNull().$type<Record<string, unknown>>(),
  narrativeSnapshot: text("narrative_snapshot").notNull(),
  legacyWeight: real("legacy_weight").default(0).notNull(),
  location: jsonb("location").$type<Record<string, unknown>>(),
  isHidden: boolean("is_hidden").default(false).notNull(),
  hiddenDifficulty: real("hidden_difficulty"),
});

export const insertRunEventSchema = createInsertSchema(runEventsTable).omit({ id: true, timestampReal: true });
export type InsertRunEvent = z.infer<typeof insertRunEventSchema>;
export type RunEvent = typeof runEventsTable.$inferSelect;
