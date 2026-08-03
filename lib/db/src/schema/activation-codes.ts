import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const activationCodesTable = pgTable("activation_codes", {
  code:      text("code").primaryKey(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  usedAt:    timestamp("used_at"),
  deviceId:  text("device_id"),
  unlockKey: text("unlock_key"),
});

export type ActivationCode = typeof activationCodesTable.$inferSelect;
