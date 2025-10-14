/**
 * User Chat Usage Validation Schemas
 *
 * ✅ DATABASE-ONLY: Pure Drizzle-Zod schemas derived from database tables
 * ❌ NO CUSTOM LOGIC: No business logic, API schemas, or computed fields
 *
 * For API-specific schemas (quotaCheckSchema, usageStatsSchema), see:
 * @/api/routes/usage/schema.ts
 */

import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import type { z } from 'zod';

import {
  userChatUsage,
  userChatUsageHistory,
} from '../tables/usage';

// ============================================================================
// User Chat Usage Schemas
// ============================================================================

export const userChatUsageSelectSchema = createSelectSchema(userChatUsage);
export const userChatUsageInsertSchema = createInsertSchema(userChatUsage, {
  threadsCreated: schema => schema.min(0),
  messagesCreated: schema => schema.min(0),
});

export type UserChatUsage = z.infer<typeof userChatUsageSelectSchema>;
export type UserChatUsageInsert = z.infer<typeof userChatUsageInsertSchema>;

// ============================================================================
// User Chat Usage History Schemas
// ============================================================================

export const userChatUsageHistorySelectSchema = createSelectSchema(userChatUsageHistory);
export const userChatUsageHistoryInsertSchema = createInsertSchema(userChatUsageHistory, {
  threadsCreated: schema => schema.min(0),
  messagesCreated: schema => schema.min(0),
  customRolesCreated: schema => schema.min(0),
});

export type UserChatUsageHistory = z.infer<typeof userChatUsageHistorySelectSchema>;
export type UserChatUsageHistoryInsert = z.infer<typeof userChatUsageHistoryInsertSchema>;
