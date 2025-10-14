/**
 * User Chat Usage Validation Schemas
 *
 * ✅ DATABASE-ONLY: Pure Drizzle-Zod schemas derived from database tables
 * ❌ NO CUSTOM LOGIC: No business logic, API schemas, or computed fields
 *
 * For API-specific schemas (quotaCheckSchema, usageStatsSchema), see:
 * @/api/routes/usage/schema.ts
 */

import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import type { z } from 'zod';

import {
  userChatUsage,
  userChatUsageHistory,
} from '../tables/usage';
import { Refinements } from './refinements';

// ============================================================================
// User Chat Usage Schemas
// ============================================================================

export const userChatUsageSelectSchema = createSelectSchema(userChatUsage);
export const userChatUsageInsertSchema = createInsertSchema(userChatUsage, {
  threadsCreated: Refinements.nonNegativeInt(),
  messagesCreated: Refinements.nonNegativeInt(),
  customRolesCreated: Refinements.nonNegativeInt(),
});
export const userChatUsageUpdateSchema = createUpdateSchema(userChatUsage, {
  threadsCreated: Refinements.nonNegativeIntOptional(),
  messagesCreated: Refinements.nonNegativeIntOptional(),
  customRolesCreated: Refinements.nonNegativeIntOptional(),
});

export type UserChatUsage = z.infer<typeof userChatUsageSelectSchema>;
export type UserChatUsageInsert = z.infer<typeof userChatUsageInsertSchema>;
export type UserChatUsageUpdate = z.infer<typeof userChatUsageUpdateSchema>;

// ============================================================================
// User Chat Usage History Schemas
// ============================================================================

export const userChatUsageHistorySelectSchema = createSelectSchema(userChatUsageHistory);
export const userChatUsageHistoryInsertSchema = createInsertSchema(userChatUsageHistory, {
  threadsCreated: Refinements.nonNegativeInt(),
  messagesCreated: Refinements.nonNegativeInt(),
  customRolesCreated: Refinements.nonNegativeInt(),
});
export const userChatUsageHistoryUpdateSchema = createUpdateSchema(userChatUsageHistory, {
  threadsCreated: Refinements.nonNegativeIntOptional(),
  messagesCreated: Refinements.nonNegativeIntOptional(),
  customRolesCreated: Refinements.nonNegativeIntOptional(),
});

export type UserChatUsageHistory = z.infer<typeof userChatUsageHistorySelectSchema>;
export type UserChatUsageHistoryInsert = z.infer<typeof userChatUsageHistoryInsertSchema>;
export type UserChatUsageHistoryUpdate = z.infer<typeof userChatUsageHistoryUpdateSchema>;
