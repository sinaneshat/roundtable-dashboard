/**
 * Shared Types for Chat Store Actions
 */

import { z } from 'zod';

import { UsageStatusSchema } from '@/api/core/enums';
import { ChatThreadCacheSchema } from '@/api/routes/chat/schema';
import { chatThreadChangelogSelectSchema } from '@/db/validation/chat';

export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown(),
});

export type ApiResponse = z.infer<typeof ApiResponseSchema>;

const UsageCreditsSchema = z.object({
  balance: z.number(),
  available: z.number(),
  status: UsageStatusSchema.optional(),
});

const UsagePlanSchema = z.object({
  type: z.string(),
  name: z.string(),
  monthlyCredits: z.number(),
  hasActiveSubscription: z.boolean().optional(),
  nextRefillAt: z.string().datetime().nullable(),
  pendingChange: z.object({
    pendingTier: z.string(),
    effectiveDate: z.string(),
  }).nullable().optional(),
});

export const UsageStatsDataSchema = z.object({
  credits: UsageCreditsSchema,
  plan: UsagePlanSchema,
});

export type UsageStatsData = z.infer<typeof UsageStatsDataSchema>;

export function validateUsageStatsCache(data: unknown): UsageStatsData | null {
  if (data === undefined || data === null) {
    return null;
  }

  const response = ApiResponseSchema.safeParse(data);
  if (!response.success || !response.data.success) {
    return null;
  }

  const usageData = UsageStatsDataSchema.safeParse(response.data.data);
  if (!usageData.success) {
    return null;
  }

  return usageData.data;
}

const UserCacheSchema = z.object({
  id: z.string().optional(),
  name: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
});

const ChatThreadCacheCompatSchema = z.object({
  id: z.string(),
  userId: z.string().optional(),
  projectId: z.string().nullable().optional(),
  title: z.string(),
  slug: z.string(),
  previousSlug: z.string().nullable().optional(),
  mode: z.string().optional(),
  status: z.string().optional(),
  isFavorite: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  isAiGeneratedTitle: z.boolean().optional(),
  enableWebSearch: z.boolean().optional(),
  metadata: z.unknown().nullable().optional(),
  version: z.number().optional(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
  lastMessageAt: z.union([z.date(), z.string()]).nullable().optional(),
});

const ChatParticipantCacheCompatSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  modelId: z.string(),
  customRoleId: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  priority: z.number().optional(),
  isEnabled: z.boolean().optional(),
  settings: z.unknown().nullable().optional(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
});

const UIMessageCacheCompatSchema = z.object({
  id: z.string(),
  role: z.string(),
  parts: z.array(z.unknown()).optional(),
  content: z.string().optional(),
  metadata: z.unknown().optional(),
  createdAt: z.union([z.date(), z.string()]).optional(),
});

export const ThreadDetailPayloadCacheSchema = z.object({
  thread: ChatThreadCacheCompatSchema,
  participants: z.array(ChatParticipantCacheCompatSchema).optional(),
  messages: z.array(UIMessageCacheCompatSchema).optional(),
  changelog: z.array(chatThreadChangelogSelectSchema).optional(),
  user: UserCacheSchema.optional(),
});

export type ThreadDetailPayloadCache = z.infer<typeof ThreadDetailPayloadCacheSchema>;

export function validateThreadDetailPayloadCache(data: unknown): ThreadDetailPayloadCache | null {
  if (data === undefined || data === null) {
    return null;
  }

  const response = ApiResponseSchema.safeParse(data);
  if (!response.success || !response.data.success) {
    return null;
  }

  const threadData = ThreadDetailPayloadCacheSchema.safeParse(response.data.data);
  if (!threadData.success) {
    return null;
  }

  return threadData.data;
}

export const PaginatedPageCacheSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      items: z.array(ChatThreadCacheSchema).optional(),
    })
    .optional(),
});

export type PaginatedPageCache = z.infer<typeof PaginatedPageCacheSchema>;

export const InfiniteQueryCacheSchema = z.object({
  pages: z.array(PaginatedPageCacheSchema),
  pageParams: z.array(z.string().nullable().optional()).optional(),
});

export type InfiniteQueryCache = z.infer<typeof InfiniteQueryCacheSchema>;

export function validateInfiniteQueryCache(data: unknown): InfiniteQueryCache | null {
  if (data === undefined || data === null) {
    return null;
  }

  const queryData = InfiniteQueryCacheSchema.safeParse(data);
  if (!queryData.success) {
    return null;
  }

  return queryData.data;
}

export const ThreadDetailCacheDataSchema = z.object({
  participants: z.array(ChatParticipantCacheCompatSchema),
});

export type ThreadDetailCacheData = z.infer<typeof ThreadDetailCacheDataSchema>;

export function validateThreadDetailCache(data: unknown): ThreadDetailCacheData | undefined {
  const result = ThreadDetailCacheDataSchema.safeParse(data);
  return result.success ? result.data : undefined;
}

export const ThreadDetailResponseCacheSchema = z.object({
  success: z.boolean(),
  data: ThreadDetailPayloadCacheSchema,
});

export type ThreadDetailResponseCache = z.infer<typeof ThreadDetailResponseCacheSchema>;

export function validateThreadDetailResponseCache(data: unknown): ThreadDetailResponseCache | undefined {
  const result = ThreadDetailResponseCacheSchema.safeParse(data);
  return result.success ? result.data : undefined;
}

export const ThreadsListCachePageSchema = z.object({
  success: z.boolean(),
  data: z.object({
    items: z.array(ChatThreadCacheCompatSchema),
  }).optional(),
});

export type ThreadsListCachePage = z.infer<typeof ThreadsListCachePageSchema>;

export function validateThreadsListPages(data: unknown): ThreadsListCachePage[] | undefined {
  if (!Array.isArray(data)) {
    return undefined;
  }

  const validated = data.map(page => ThreadsListCachePageSchema.safeParse(page));

  if (validated.some(result => !result.success)) {
    return undefined;
  }

  return validated.map(result => result.data!);
}

const ChangelogItemCacheSchema = chatThreadChangelogSelectSchema.extend({
  createdAt: z.union([z.date(), z.string()]),
});

export const ChangelogListCacheSchema = z.object({
  success: z.boolean(),
  data: z.object({
    items: z.array(ChangelogItemCacheSchema),
  }).optional(),
});

export type ChangelogListCache = z.infer<typeof ChangelogListCacheSchema>;

export type ChangelogItemCache = z.infer<typeof ChangelogItemCacheSchema>;

export function validateChangelogListCache(data: unknown): ChangelogListCache | null {
  if (data === undefined || data === null) {
    return null;
  }

  const result = ChangelogListCacheSchema.safeParse(data);
  if (!result.success) {
    return null;
  }

  return result.data;
}
