/**
 * Shared Types for Chat Store Actions
 */

import { UsageStatusSchema } from '@roundtable/shared';
import { z } from 'zod';

/** Generic API response wrapper - data field validated by specific schemas */
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.record(z.string(), z.unknown()).optional(),
}).strict();

export type ApiResponse = z.infer<typeof ApiResponseSchema>;

const UsageCreditsSchema = z.object({
  balance: z.number().nonnegative(),
  available: z.number().nonnegative(),
  status: UsageStatusSchema.optional(),
}).strict();

const UsagePlanSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  monthlyCredits: z.number().int().nonnegative(),
  hasActiveSubscription: z.boolean().optional(),
  freeRoundUsed: z.boolean().optional(),
  nextRefillAt: z.string().datetime().nullable(),
  pendingChange: z.object({
    pendingTier: z.string().min(1),
    effectiveDate: z.string().min(1),
  }).strict().nullable().optional(),
}).strict();

export const UsageStatsDataSchema = z.object({
  credits: UsageCreditsSchema,
  plan: UsagePlanSchema,
}).strict();

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
  id: z.string().min(1).optional(),
  name: z.string().nullable().optional(),
  image: z.string().url().nullable().optional(),
}).strict();

/** Thread metadata schema - allows extensible key-value pairs */
const ThreadMetadataSchema = z.record(z.string(), z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
])).nullable().optional();

export const ChatThreadCacheSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1).optional(),
  projectId: z.string().min(1).nullable().optional(),
  title: z.string(),
  slug: z.string().min(1),
  previousSlug: z.string().min(1).nullable().optional(),
  mode: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  isFavorite: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  isAiGeneratedTitle: z.boolean().optional(),
  enableWebSearch: z.boolean().optional(),
  metadata: ThreadMetadataSchema,
  version: z.number().int().nonnegative().optional(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
  lastMessageAt: z.union([z.date(), z.string()]).nullable().optional(),
}).strict();

/** Participant settings schema - allows extensible configuration */
const ParticipantSettingsSchema = z.record(z.string(), z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
])).nullable().optional();

const ChatParticipantCacheCompatSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  modelId: z.string().min(1),
  customRoleId: z.string().min(1).nullable().optional(),
  role: z.string().min(1).nullable().optional(),
  priority: z.number().int().nonnegative().optional(),
  isEnabled: z.boolean().optional(),
  settings: ParticipantSettingsSchema,
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
}).strict();

/** Message part schema - supports text, file, reasoning parts */
const MessagePartCacheSchema = z.object({
  type: z.string().min(1),
  text: z.string().optional(),
  state: z.string().optional(),
}).passthrough();

/** Message metadata schema - allows extensible metadata */
const MessageMetadataCacheSchema = z.record(z.string(), z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
])).optional();

const UIMessageCacheCompatSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  parts: z.array(MessagePartCacheSchema).optional(),
  content: z.string().optional(),
  metadata: MessageMetadataCacheSchema,
  createdAt: z.union([z.date(), z.string()]).optional(),
}).strict();

/** Changelog entry schema for cache validation */
const ChangelogEntryCacheSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  changeType: z.string().min(1),
  changeSummary: z.string(),
  changeData: z.record(z.string(), z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.unknown()),
    z.record(z.string(), z.unknown()),
  ])),
  roundNumber: z.number().int().nonnegative().optional(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]).optional(),
}).strict();

export const ThreadDetailPayloadCacheSchema = z.object({
  thread: ChatThreadCacheSchema,
  participants: z.array(ChatParticipantCacheCompatSchema).optional(),
  messages: z.array(UIMessageCacheCompatSchema).optional(),
  changelog: z.array(ChangelogEntryCacheSchema).optional(),
  user: UserCacheSchema.optional(),
}).strict();

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
      pagination: z.object({
        nextCursor: z.string().nullable().optional(),
      }).strict().optional(),
    })
    .strict()
    .optional(),
}).strict();

export type PaginatedPageCache = z.infer<typeof PaginatedPageCacheSchema>;

export const InfiniteQueryCacheSchema = z.object({
  pages: z.array(PaginatedPageCacheSchema).min(1),
  pageParams: z.array(z.string().nullable().optional()).optional(),
}).strict();

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
  participants: z.array(ChatParticipantCacheCompatSchema).min(1),
}).strict();

export type ThreadDetailCacheData = z.infer<typeof ThreadDetailCacheDataSchema>;

export function validateThreadDetailCache(data: unknown): ThreadDetailCacheData | undefined {
  const result = ThreadDetailCacheDataSchema.safeParse(data);
  return result.success ? result.data : undefined;
}

export const ThreadDetailResponseCacheSchema = z.object({
  success: z.boolean(),
  data: ThreadDetailPayloadCacheSchema,
}).strict();

export type ThreadDetailResponseCache = z.infer<typeof ThreadDetailResponseCacheSchema>;

export function validateThreadDetailResponseCache(data: unknown): ThreadDetailResponseCache | undefined {
  const result = ThreadDetailResponseCacheSchema.safeParse(data);
  return result.success ? result.data : undefined;
}

export const ThreadsListCachePageSchema = z.object({
  success: z.boolean(),
  data: z.object({
    items: z.array(ChatThreadCacheSchema),
  }).strict().optional(),
}).strict();

export type ThreadsListCachePage = z.infer<typeof ThreadsListCachePageSchema>;

export function validateThreadsListPages(data: unknown): ThreadsListCachePage[] | undefined {
  if (!Array.isArray(data)) {
    return undefined;
  }

  const validated = data.map(page => ThreadsListCachePageSchema.safeParse(page));

  if (validated.some(result => !result.success)) {
    return undefined;
  }

  return validated
    .filter((result): result is z.ZodSafeParseSuccess<ThreadsListCachePage> => result.success)
    .map(result => result.data);
}

const ChangelogItemCacheSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  changeType: z.string().min(1),
  changeSummary: z.string(),
  changeData: z.record(z.string(), z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.unknown()),
    z.record(z.string(), z.unknown()),
  ])),
  roundNumber: z.number().int().nonnegative().optional(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]).optional(),
}).strict();

export const ChangelogListCacheSchema = z.object({
  success: z.boolean(),
  data: z.object({
    items: z.array(ChangelogItemCacheSchema),
  }).strict().optional(),
}).strict();

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

// ============================================================================
// Thread Slug Status Cache Validation
// ============================================================================

export const ThreadSlugStatusPayloadSchema = z.object({
  slug: z.string().min(1),
  title: z.string(),
  isAiGeneratedTitle: z.boolean(),
}).strict();

export type ThreadSlugStatusPayload = z.infer<typeof ThreadSlugStatusPayloadSchema>;

export const ThreadSlugStatusResponseSchema = z.object({
  success: z.literal(true),
  data: ThreadSlugStatusPayloadSchema,
}).strict();

export type ThreadSlugStatusResponse = z.infer<typeof ThreadSlugStatusResponseSchema>;

/**
 * Validate and extract slug status data from query response
 * @returns Validated payload data or null if validation fails
 */
export function validateSlugStatusResponse(data: unknown): ThreadSlugStatusPayload | null {
  if (data === undefined || data === null) {
    return null;
  }

  const result = ThreadSlugStatusResponseSchema.safeParse(data);
  if (!result.success) {
    return null;
  }

  return result.data.data;
}
