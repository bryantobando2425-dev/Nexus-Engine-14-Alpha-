import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { runsTable } from "./runs";
import { playersTable } from "./players";

export const momentsTable = pgTable("moments", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").references(() => runsTable.id).notNull(),
  playerId: uuid("player_id").references(() => playersTable.id).notNull(),
  imageUrl: text("image_url").notNull(),
  promptUsed: text("prompt_used").notNull(),
  contextSnapshot: text("context_snapshot").notNull(),
  ingameDate: text("ingame_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  isFavorite: boolean("is_favorite").default(false).notNull(),
});

export const insertMomentSchema = createInsertSchema(momentsTable).omit({ id: true, createdAt: true });
export type InsertMoment = z.infer<typeof insertMomentSchema>;
export type Moment = typeof momentsTable.$inferSelect;
