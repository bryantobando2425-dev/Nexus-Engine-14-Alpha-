import { pgTable, text, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";

export const runsTable = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: uuid("player_id").references(() => playersTable.id).notNull(),
  gameId: text("game_id").notNull(),
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  endCause: text("end_cause"),
  eraConfig: jsonb("era_config").notNull().$type<Record<string, unknown>>(),
  character: jsonb("character").notNull().$type<Record<string, unknown>>(),
  finalState: jsonb("final_state").$type<Record<string, unknown>>(),
  summary: text("summary"),
});

export const insertRunSchema = createInsertSchema(runsTable).omit({ id: true, startedAt: true });
export type InsertRun = z.infer<typeof insertRunSchema>;
export type Run = typeof runsTable.$inferSelect;
