/**
 * API Type Stubs
 *
 * These are temporary type stubs for types that exist in the API package.
 * They allow the web package to compile while the proper type sharing
 * via @roundtable/shared is set up.
 *
 * TODO: Properly share these via @roundtable/shared after migration is complete
 */

import type { ChangelogType, MessageStatus, WebSearchDepth } from '@roundtable/shared';
import { z } from 'zod';

// Re-export from API package types when available
// For now, define minimal types to satisfy imports

// =============================================================================
// Chat Types
// =============================================================================

export type ChatThread = {
  id: string;
  title: string | null;
  slug: string | null;
  previousSlug: string | null;
  mode: string;
  status: string;
  userId: string;
  projectId: string | null;
  metadata: Record<string, unknown>;
  isPublic?: boolean;
  isFavorite?: boolean;
  isAiGeneratedTitle: boolean;
  enableWebSearch: boolean;
  version: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatThreadFlexible = {
  id: string;
} & Partial<ChatThread>;

export type ChatParticipant = {
  id: string;
  threadId: string;
  modelId: string;
  customRoleId?: string | null;
  priority: number;
  role?: string | null;
  settings?: Record<string, unknown> | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  participantId: string | null;
  role: string;
  content: string | null;
  parts: unknown[];
  status: string;
  metadata: Record<string, unknown>;
  roundNumber: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatThreadChangelog = {
  id: string;
  threadId: string;
  changeType: ChangelogType;
  changeSummary: string;
  changeData: Record<string, unknown>;
  roundNumber: number | null;
  previousRoundNumber: number | null;
  createdAt: string;
};

export type ChatThreadChangelogFlexible = {
  id: string;
  changeType: ChangelogType;
  changeData: Record<string, unknown>;
} & Partial<ChatThreadChangelog>;

export type ChatSidebarItem = {
  id: string;
  title: string | null;
  slug: string | null;
  previousSlug: string | null;
  mode: string;
  isFavorite?: boolean;
  isPublic?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StoredThread = {
  participants: ChatParticipant[];
} & ChatThread;

// =============================================================================
// Pre-Search Types
// =============================================================================

export type StoredPreSearch = {
  id: string;
  threadId: string;
  roundNumber: number;
  userQuery: string;
  status: string;
  searchData: PreSearchDataPayload | null;
  errorMessage: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type PreSearchQuery = {
  query: string;
  rationale?: string;
  searchDepth?: WebSearchDepth;
  index: number;
  total?: number;
  complexity?: string;
  sourceCount?: number;
};

export type PreSearchResult = {
  query: string;
  answer?: string;
  results: WebSearchResultItem[];
  responseTime?: number;
  index: number;
};

export type PreSearchDataPayload = {
  queries: PreSearchQuery[];
  results: PreSearchResult[];
  answer?: string | null;
  summary?: string;
  totalResults?: number;
  totalTime?: number;
};

export type PartialPreSearchData = {
  queries?: PreSearchQuery[];
  results?: PreSearchResult[];
  answer?: string | null;
  summary?: string;
  totalResults?: number;
  totalTime?: number;
  index?: number;
};

export type PreSearchRecord = {
  id: string;
  threadId: string;
  roundNumber: number;
  status: string;
  data: PreSearchDataPayload | null;
};

export type GeneratedSearchQuery = {
  query: string;
  topic?: string;
  depth?: string;
  timeRange?: string;
  rationale?: string;
  searchDepth?: WebSearchDepth;
  index?: number;
  complexity?: string;
  sourceCount?: number;
  total?: number;
};

export type WebSearchResultItem = {
  title: string;
  url: string;
  snippet: string;
  domain?: string;
  publishedDate?: string;
  favicon?: string;
  score?: number;
  keyPoints?: string[];
  metadata?: {
    imageUrl?: string;
    faviconUrl?: string;
    author?: string;
    readingTime?: number;
    wordCount?: number;
    [key: string]: unknown;
  };
  images?: Array<{ url: string; alt?: string }>;
  rawContent?: string;
  fullContent?: string;
  content?: string;
  excerpt?: string;
};

// =============================================================================
// Model Types
// =============================================================================

export type Model = {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  pricing: { prompt: string; completion: string };
  supports_vision: boolean;
  supports_file: boolean;
  is_reasoning_model: boolean;
  category?: string[];
  tags?: string[];
};

export type EnhancedModel = {
  is_accessible_to_user?: boolean;
  required_tier_name?: string | null;
  tier_badge?: string | null;
} & Model;

export type EnhancedModelResponse = EnhancedModel;

export type CustomRole = {
  id: string;
  name: string;
  description?: string | null;
};

// =============================================================================
// Metadata Types
// =============================================================================

export type Usage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type DbMessageMetadata = {
  role: 'user' | 'assistant';
  roundNumber: number;
  createdAt?: string;
};

export type DbUserMessageMetadata = {
  role: 'user';
  roundNumber: number;
  createdAt?: string;
  isParticipantTrigger?: boolean;
};

export type DbAssistantMessageMetadata = {
  role: 'assistant';
  roundNumber: number;
  participantId?: string;
  participantIndex?: number;
  participantRole?: string | null;
  model?: string;
  finishReason?: string;
  usage?: Usage;
  hasError?: boolean;
  errorType?: string;
  errorMessage?: string;
  errorCategory?: string;
  rawErrorMessage?: string;
  providerMessage?: string;
  statusCode?: number;
  openRouterError?: Record<string, string | number | boolean | null>;
  openRouterCode?: string | number;
  isTransient?: boolean;
  isPartialResponse?: boolean;
  createdAt?: string;
  availableSources?: AvailableSource[];
  citations?: DbCitation[];
  reasoningDuration?: number;
};

export type DbPreSearchMessageMetadata = {
  role: 'assistant';
  roundNumber: number;
  isPreSearch: true;
  preSearchId: string;
  status?: string;
  queries?: GeneratedSearchQuery[];
  results?: WebSearchResultItem[];
  answer?: string;
  createdAt?: string;
};

export type DbModeratorMessageMetadata = {
  role: 'assistant';
  roundNumber: number;
  isModerator: true;
  moderatorData?: ModeratorPayload;
  finishReason?: string;
  createdAt?: string;
};

export type DbChangelogData = {
  type: string;
  modelId?: string;
  role?: string | null;
  oldRole?: string | null;
  newRole?: string | null;
  oldMode?: string;
  newMode?: string;
  enabled?: boolean;
  participants?: unknown[];
  [key: string]: unknown;
};

export type DbCitation = {
  id: string;
  sourceType: string;
  sourceIndex: number;
  text: string;
  title: string;
  url?: string;
  description?: string;
  excerpt?: string;
  downloadUrl?: string;
  filename?: string;
  mimeType?: string;
  fileSize?: number;
  threadTitle?: string;
};

// =============================================================================
// Moderator Types
// =============================================================================

export type ModeratorPayload = {
  summary: string;
  insights: string[];
  recommendations?: string[];
};

export type StoredModeratorData = {
  id: string;
  threadId?: string;
  roundNumber: number;
  mode?: string;
  userQuestion?: string;
  status: MessageStatus;
  moderatorData: ModeratorPayload | null;
  participantMessageIds?: string[];
  createdAt: string | Date;
  completedAt: string | null;
  errorMessage: string | null;
};

export type StoredModeratorSummary = {
  content: string;
  generatedAt: string;
};

// =============================================================================
// Stream Resumption Types
// =============================================================================

export type ThreadStreamResumptionState = {
  hasActiveStream: boolean;
  activeParticipantIds: string[];
  streamId: string | null;
  lastEventId: string | null;
  roundNumber: number;
  currentPhase: 'idle' | 'pre_search' | 'participants' | 'moderator' | 'complete';
  preSearch: {
    enabled: boolean;
    status: string;
    streamId: string;
    preSearchId: string;
  };
  participants: {
    total: number;
    completed: number;
    statuses: Record<string, string>;
  };
  moderator: {
    status: string;
    streamId: string;
  };
  roundComplete: boolean;
};

// =============================================================================
// Round Feedback Types
// =============================================================================

export type RoundFeedbackData = {
  threadId: string;
  roundNumber: number;
  feedbackType: 'like' | 'dislike' | null;
};

// =============================================================================
// Citation Types
// =============================================================================

export type CitableSource = {
  type: string;
  index: number;
  title: string;
  url?: string;
  content?: string;
};

export type CitationSourceMap = {
  [key: string]: CitableSource;
};

export type AttachmentCitationInfo = {
  attachmentId: string;
  filename: string;
  mimeType: string;
};

export type AvailableSource = {
  id?: string;
  type?: string;
  sourceType: string;
  index?: number;
  title: string;
  url?: string;
  description?: string;
  filename?: string;
  mimeType?: string;
  fileSize?: number;
  downloadUrl?: string;
  threadTitle?: string;
  excerpt?: string;
};

// =============================================================================
// Analyze Prompt Types
// =============================================================================

export type AnalyzePromptPayload = {
  participants: Array<{ modelId: string; role: string | null }>;
  mode: string;
  enableWebSearch: boolean;
};

// =============================================================================
// Web Search UI Types
// =============================================================================

export type WebSearchDisplayExtendedProps = {
  results: WebSearchResultItem[];
  className?: string;
  meta?: Record<string, unknown>;
  answer?: string | null;
  isStreaming?: boolean;
  requestId?: string;
  query?: string;
  autoParameters?: Record<string, unknown>;
  isLoading?: boolean;
};

export type WebSearchImageItem = {
  url: string;
  alt?: string;
  title: string;
  sourceUrl: string;
  domain?: string;
  thumbnailUrl?: string;
};

export type WebSearchImageGalleryProps = {
  results: WebSearchResultItem[];
  className?: string;
};

export type WebSearchResultItemProps = {
  result: WebSearchResultItem;
  index?: number;
  showDivider?: boolean;
  className?: string;
};

// =============================================================================
// Configuration Changes Group Types
// =============================================================================

export type ConfigurationChangesGroupProps = {
  group: {
    changes: ChatThreadChangelogFlexible[];
    timestamp: string;
  };
  className?: string;
};

// =============================================================================
// Schema Types (Zod Schemas)
// =============================================================================

export const UsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
});

export const DbMessageMetadataSchema = z.object({
  role: z.enum(['user', 'assistant']),
  roundNumber: z.number(),
  createdAt: z.string().optional(),
});

export const DbUserMessageMetadataSchema = z.object({
  role: z.literal('user'),
  roundNumber: z.number(),
  createdAt: z.string().optional(),
});

export const DbAssistantMessageMetadataSchema = z.object({
  role: z.literal('assistant'),
  roundNumber: z.number(),
  participantId: z.string().optional(),
  participantIndex: z.number().optional(),
  participantRole: z.string().nullable().optional(),
  model: z.string().optional(),
  finishReason: z.string().optional(),
  usage: UsageSchema.optional(),
  hasError: z.boolean().optional(),
  errorType: z.string().optional(),
  errorMessage: z.string().optional(),
  errorCategory: z.string().optional(),
  rawErrorMessage: z.string().optional(),
  providerMessage: z.string().optional(),
  statusCode: z.number().optional(),
  openRouterError: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  openRouterCode: z.union([z.string(), z.number()]).optional(),
  isTransient: z.boolean().optional(),
  isPartialResponse: z.boolean().optional(),
  createdAt: z.string().optional(),
  availableSources: z.array(z.any()).optional(),
  citations: z.array(z.any()).optional(),
  reasoningDuration: z.number().optional(),
});

export const DbPreSearchMessageMetadataSchema = z.object({
  role: z.literal('assistant'),
  roundNumber: z.number(),
  isPreSearch: z.literal(true),
  preSearchId: z.string(),
  status: z.string().optional(),
  queries: z.array(z.any()).optional(),
  results: z.array(z.any()).optional(),
  answer: z.string().optional(),
  createdAt: z.string().optional(),
});

export const DbModeratorMessageMetadataSchema = z.object({
  role: z.literal('assistant'),
  roundNumber: z.number(),
  isModerator: z.literal(true),
  moderatorData: z.any().optional(),
  createdAt: z.string().optional(),
});

export const MessageContentSchema = z.string();
export const ChatThreadCacheSchema = z.any();
export const EnhancedModelSchema = z.any();
export const PreSearchDataPayloadSchema = z.any();
export const PreSearchResponseSchema = z.any();
export const StoredPreSearchSchema = z.any();
export const WebSearchResultSchema = z.any();

// =============================================================================
// Database Select Schemas (mirroring API validation schemas)
// =============================================================================

/**
 * Chat Message Select Schema
 * Matches the API's chatMessageSelectSchema from db/validation/chat.ts
 */
export const chatMessageSelectSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  participantId: z.string().nullable(),
  role: z.string(),
  content: z.string().nullable(),
  parts: z.array(z.unknown()),
  status: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  roundNumber: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Chat Participant Select Schema
 * Matches the API's chatParticipantSelectSchema from db/validation/chat.ts
 * Note: Uses string dates to match existing ChatParticipant type definition
 */
export const chatParticipantSelectSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  modelId: z.string(),
  customRoleId: z.string().nullable().optional(),
  priority: z.number(),
  role: z.string().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).nullable().optional(),
  isEnabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Chat Thread Changelog Select Schema
 * Matches the API's chatThreadChangelogSelectSchema from db/validation/chat.ts
 * Note: Uses string dates to match existing ChatThreadChangelog type definition
 */
export const chatThreadChangelogSelectSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  changeType: z.string(),
  changeSummary: z.string(),
  changeData: z.record(z.string(), z.unknown()),
  roundNumber: z.number().nullable(),
  previousRoundNumber: z.number().nullable(),
  createdAt: z.string(),
});

// =============================================================================
// Type Guards
// =============================================================================

export function isAssistantMessageMetadata(metadata: unknown): metadata is DbAssistantMessageMetadata {
  return (
    typeof metadata === 'object'
    && metadata !== null
    && 'role' in metadata
    && (metadata as DbAssistantMessageMetadata).role === 'assistant'
    && !('isModerator' in metadata)
  );
}

export function isModeratorMessageMetadata(metadata: unknown): metadata is DbModeratorMessageMetadata {
  return (
    typeof metadata === 'object'
    && metadata !== null
    && 'isModerator' in metadata
    && (metadata as DbModeratorMessageMetadata).isModerator === true
  );
}

export function isParticipantMessageMetadata(metadata: unknown): metadata is DbAssistantMessageMetadata & { participantId: string } {
  return (
    typeof metadata === 'object'
    && metadata !== null
    && 'participantId' in metadata
    && typeof (metadata as { participantId?: unknown }).participantId === 'string'
    && (metadata as { participantId: unknown }).participantId !== undefined
  );
}

// =============================================================================
// Changelog Data Type Guards
// =============================================================================

export function isParticipantChange(data: DbChangelogData): data is DbChangelogData & { modelId: string; role?: string | null } {
  return data.type === 'participant' && typeof data.modelId === 'string';
}

export function isParticipantRoleChange(data: DbChangelogData): data is DbChangelogData & { modelId: string; oldRole?: string | null; newRole?: string | null } {
  return data.type === 'participant_role' && typeof data.modelId === 'string';
}

export function isModeChange(data: DbChangelogData): data is DbChangelogData & { oldMode?: string; newMode?: string } {
  return data.type === 'mode_change';
}

export function isWebSearchChange(data: DbChangelogData): data is DbChangelogData & { enabled: boolean } {
  return data.type === 'web_search' && typeof data.enabled === 'boolean';
}

export function safeParseChangelogData(data: unknown): DbChangelogData | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const obj = data as Record<string, unknown>;
  if (typeof obj.type !== 'string') {
    return undefined;
  }

  return obj as DbChangelogData;
}

// =============================================================================
// Request/Response Schema Types
// =============================================================================

export type CreateThreadRequestSchema = z.ZodType<{
  title?: string;
  mode: string;
  participants: Array<{ modelId: string; role?: string | null }>;
}>;
