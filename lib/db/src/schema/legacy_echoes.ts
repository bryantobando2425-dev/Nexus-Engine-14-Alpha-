import { pgTable, text, timestamp, jsonb, uuid, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { runsTable } from "./runs";
import { playersTable } from "./players";

export const legacyEchoesTable = pgTable("legacy_echoes", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceRunId: uuid("source_run_id").references(() => runsTable.id).notNull(),
  playerId: uuid("player_id").references(() => playersTable.id).notNull(),
  gameId: text("game_id").notNull(),
  echoType: text("echo_type").notNull(),
  echoData: jsonb("echo_data").notNull().$type<Record<string, unknown>>(),
  discoveryDifficulty: real("discovery_difficulty").default(0.5).notNull(),
  isDiscovered: boolean("is_discovered").default(false).notNull(),
  discoveredInRunId: uuid("discovered_in_run_id").references(() => runsTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLegacyEchoSchema = createInsertSchema(legacyEchoesTable).omit({ id: true, createdAt: true });
export type InsertLegacyEcho = z.infer<typeof insertLegacyEchoSchema>;
export type LegacyEcho = typeof legacyEchoesTable.$inferSelect;
