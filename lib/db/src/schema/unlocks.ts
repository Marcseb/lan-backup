import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const unlocksTable = pgTable("unlocks", {
  id: text("id").primaryKey(),
  payerEmail: text("payer_email").notNull(),
  unlockKey: text("unlock_key").notNull(),
  confirmedAt: timestamp("confirmed_at").notNull().defaultNow(),
  paypalTxnId: text("paypal_txn_id"),
  sandbox: boolean("sandbox").notNull().default(false),
});

export const insertUnlockSchema = createInsertSchema(unlocksTable).omit({ confirmedAt: true });
export type InsertUnlock = z.infer<typeof insertUnlockSchema>;
export type Unlock = typeof unlocksTable.$inferSelect;
