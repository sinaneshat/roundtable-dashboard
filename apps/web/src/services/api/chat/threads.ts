/**
 * Chat Threads Service - Thread Management API
 *
 * 100% type-safe RPC service for chat thread operations
 * All types automatically inferred from backend Hono routes
 */

import type { InferRequestType, InferResponseType } from 'hono/client';
import { parseResponse } from 'hono/client';

import type { ApiClientType } from '@/lib/api/client';
import { createApiClient, createPublicApiClient } from '@/lib/api/client';
import type { ServiceOptions } from '@/services/api/types';

// ============================================================================
// Type Inference - Thread Operations
// ============================================================================

type ListThreadsEndpoint = ApiClientType['chatThread']['chat']['threads']['$get'];
type CreateThreadEndpoint = ApiClientType['chatThread']['chat']['threads']['$post'];
type GetThreadEndpoint = ApiClientType['chatThread']['chat']['threads'][':id']['$get'];
type UpdateThreadEndpoint = ApiClientType['chatThread']['chat']['threads'][':id']['$patch'];
type DeleteThreadEndpoint = ApiClientType['chatThread']['chat']['threads'][':id']['$delete'];

export type ListThreadsRequest = InferRequestType<ListThreadsEndpoint>;
export type ListThreadsResponse = InferResponseType<ListThreadsEndpoint, 200>;
export type CreateThreadRequest = InferRequestType<CreateThreadEndpoint>;
export type CreateThreadResponse = InferResponseType<CreateThreadEndpoint, 200>;
export type GetThreadRequest = InferRequestType<GetThreadEndpoint>;
export type GetThreadResponse = InferResponseType<GetThreadEndpoint, 200>;
export type UpdateThreadRequest = InferRequestType<UpdateThreadEndpoint>;
export type UpdateThreadResponse = InferResponseType<UpdateThreadEndpoint, 200>;
export type DeleteThreadRequest = InferRequestType<DeleteThreadEndpoint>;
export type DeleteThreadResponse = InferResponseType<DeleteThreadEndpoint, 200>;

// ============================================================================
// Type Inference - Public Thread Operations
// ============================================================================

type GetPublicThreadEndpoint = ApiClientType['chatThread']['chat']['public'][':slug']['$get'];
type ListPublicThreadSlugsEndpoint = ApiClientType['chatThread']['chat']['public']['slugs']['$get'];
type GetThreadBySlugEndpoint = ApiClientType['chatThread']['chat']['threads']['slug'][':slug']['$get'];
type GetThreadSlugStatusEndpoint = ApiClientType['chatThread']['chat']['threads'][':id']['slug-status']['$get'];

export type GetPublicThreadRequest = InferRequestType<GetPublicThreadEndpoint>;
export type GetPublicThreadResponse = InferResponseType<GetPublicThreadEndpoint, 200>;
export type ListPublicThreadSlugsResponse = InferResponseType<ListPublicThreadSlugsEndpoint, 200>;
export type GetThreadBySlugRequest = InferRequestType<GetThreadBySlugEndpoint>;
export type GetThreadBySlugResponse = InferResponseType<GetThreadBySlugEndpoint, 200>;
export type GetThreadSlugStatusRequest = InferRequestType<GetThreadSlugStatusEndpoint>;
export type GetThreadSlugStatusResponse = InferResponseType<GetThreadSlugStatusEndpoint, 200>;

// ============================================================================
// Type Inference - Sidebar, Messages, Changelog
// ============================================================================

type ListSidebarThreadsEndpoint = ApiClientType['chatThread']['chat']['threads']['sidebar']['$get'];
type GetThreadMessagesEndpoint = ApiClientType['chatMessage']['chat']['threads'][':id']['messages']['$get'];
type GetThreadChangelogEndpoint = ApiClientType['chatMessage']['chat']['threads'][':id']['changelog']['$get'];
type GetThreadRoundChangelogEndpoint = ApiClientType['chatMessage']['chat']['threads'][':threadId']['rounds'][':roundNumber']['changelog']['$get'];

export type ListSidebarThreadsRequest = InferRequestType<ListSidebarThreadsEndpoint>;
export type ListSidebarThreadsResponse = InferResponseType<ListSidebarThreadsEndpoint, 200>;
export type GetThreadMessagesRequest = InferRequestType<GetThreadMessagesEndpoint>;
export type GetThreadMessagesResponse = InferResponseType<GetThreadMessagesEndpoint, 200>;
export type GetThreadChangelogRequest = InferRequestType<GetThreadChangelogEndpoint>;
export type GetThreadChangelogResponse = InferResponseType<GetThreadChangelogEndpoint, 200>;
export type GetThreadRoundChangelogRequest = InferRequestType<GetThreadRoundChangelogEndpoint>;
export type GetThreadRoundChangelogResponse = InferResponseType<GetThreadRoundChangelogEndpoint, 200>;

// ============================================================================
// Type Inference - Stream Resumption & Auto Mode
// ============================================================================

type GetThreadStreamResumptionStateEndpoint = ApiClientType['chatMessage']['chat']['threads'][':threadId']['stream-status']['$get'];
type AnalyzePromptEndpoint = ApiClientType['chatMessage']['chat']['analyze']['$post'];
type GetThreadMemoryEventsEndpoint = ApiClientType['chatThread']['chat']['threads'][':threadId']['memory-events']['$get'];

export type GetThreadStreamResumptionStateRequest = InferRequestType<GetThreadStreamResumptionStateEndpoint>;
export type GetThreadStreamResumptionStateResponse = InferResponseType<GetThreadStreamResumptionStateEndpoint, 200>;
export type AnalyzePromptRequest = InferRequestType<AnalyzePromptEndpoint>;
export type AnalyzePromptResponse = InferResponseType<AnalyzePromptEndpoint, 200>;
export type GetThreadMemoryEventsRequest = InferRequestType<GetThreadMemoryEventsEndpoint>;
export type GetThreadMemoryEventsResponse = InferResponseType<GetThreadMemoryEventsEndpoint, 200>;

// ============================================================================
// Service Functions - Thread CRUD
// ============================================================================

export async function listThreadsService(data?: ListThreadsRequest, options?: ServiceOptions) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.chatThread.chat.threads.$get(data ?? { query: {} }));
}

export async function createThreadService(data: CreateThreadRequest) {
  const client = createApiClient();
  return parseResponse(client.chatThread.chat.threads.$post(data));
}

export async function getThreadService(data: GetThreadRequest) {
  const client = createApiClient();
  return parseResponse(client.chatThread.chat.threads[':id'].$get(data));
}

export async function updateThreadService(data: UpdateThreadRequest) {
  const client = createApiClient();
  return parseResponse(client.chatThread.chat.threads[':id'].$patch(data));
}

export async function deleteThreadService(data: DeleteThreadRequest) {
  const client = createApiClient();
  return parseResponse(client.chatThread.chat.threads[':id'].$delete(data));
}

// ============================================================================
// Service Functions - Sidebar Threads
// ============================================================================

export async function listSidebarThreadsService(data?: ListSidebarThreadsRequest, options?: ServiceOptions) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.chatThread.chat.threads.sidebar.$get(data ?? { query: {} }));
}

// ============================================================================
// Service Functions - Public Thread Operations
// ============================================================================

export async function getPublicThreadService(data: GetPublicThreadRequest) {
  const client = createPublicApiClient();
  return parseResponse(client.chatThread.chat.public[':slug'].$get(data));
}

export async function listPublicThreadSlugsService() {
  const client = createPublicApiClient();
  return parseResponse(client.chatThread.chat.public.slugs.$get());
}

export async function getThreadBySlugService(
  data: GetThreadBySlugRequest,
  options?: { cookieHeader?: string },
) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.chatThread.chat.threads.slug[':slug'].$get(data));
}

export async function getThreadSlugStatusService(data: GetThreadSlugStatusRequest) {
  const client = createApiClient();
  return parseResponse(client.chatThread.chat.threads[':id']['slug-status'].$get(data));
}

// ============================================================================
// Service Functions - Messages and Changelog
// ============================================================================

export async function getThreadMessagesService(data: GetThreadMessagesRequest) {
  const client = createApiClient();
  return parseResponse(client.chatMessage.chat.threads[':id'].messages.$get(data));
}

export async function getThreadChangelogService(
  data: GetThreadChangelogRequest,
  options?: { cookieHeader?: string },
) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.chatMessage.chat.threads[':id'].changelog.$get(data));
}

export async function getThreadRoundChangelogService(data: GetThreadRoundChangelogRequest) {
  const client = createApiClient();
  return parseResponse(client.chatMessage.chat.threads[':threadId'].rounds[':roundNumber'].changelog.$get(data));
}

// ============================================================================
// Service Functions - Stream Resumption
// ============================================================================

export async function getThreadStreamResumptionStateService(
  data: GetThreadStreamResumptionStateRequest,
  options?: { cookieHeader?: string },
) {
  const client = createApiClient({ cookieHeader: options?.cookieHeader });
  return parseResponse(client.chatMessage.chat.threads[':threadId']['stream-status'].$get(data));
}

// ============================================================================
// Service Functions - Memory Events
// ============================================================================

/**
 * Get memory events for a specific round
 * Used to poll for memory creation after round completes
 */
export async function getThreadMemoryEventsService(data: GetThreadMemoryEventsRequest) {
  const client = createApiClient();
  return parseResponse(client.chatThread.chat.threads[':threadId']['memory-events'].$get(data));
}

// ============================================================================
// Service Functions - Auto Mode (Streaming - NO parseResponse)
// ============================================================================

/**
 * Execute analyze prompt SSE stream
 * Protected endpoint - requires authentication
 *
 * Returns SSE stream with events: start, config, done, failed
 * EXCEPTION: Does NOT parse response because SSE streams must return raw Response
 * object for EventSource/ReadableStream processing.
 */
export async function analyzePromptStreamService(
  data: AnalyzePromptRequest,
  options?: { signal?: AbortSignal },
) {
  const client = createApiClient({ signal: options?.signal });
  return client.chatMessage.chat.analyze.$post(data);
}

// ============================================================================
// Type Extractions - Derived from API Response Types (SINGLE SOURCE OF TRUTH)
// ============================================================================

/**
 * Thread detail payload data extracted from GetThreadResponse
 * Contains: thread, participants, messages, changelog, feedback, preSearches, user
 */
export type ThreadDetailData = Extract<GetThreadResponse, { success: true }> extends { data: infer D } ? D : never;

/**
 * Public thread payload data extracted from GetPublicThreadResponse
 * Same structure as ThreadDetailData but from public endpoint
 */
export type PublicThreadData = Extract<GetPublicThreadResponse, { success: true }> extends { data: infer D } ? D : never;

/**
 * Message type from API response - derived from ThreadDetailData
 */
export type ApiMessage = ThreadDetailData['messages'][number];

/**
 * Changelog type from API response - derived from ThreadDetailData
 */
export type ApiChangelog = ThreadDetailData['changelog'][number];

/**
 * Participant type from API response - derived from ThreadDetailData
 */
export type ApiParticipant = ThreadDetailData['participants'][number];

/**
 * Changelog list payload data extracted from GetThreadChangelogResponse
 */
export type ChangelogListData = Extract<GetThreadChangelogResponse, { success: true }> extends { data: infer D } ? D : never;

/**
 * Individual changelog item from changelog list endpoint
 */
export type ChangelogItem = ChangelogListData['items'][number];

// ============================================================================
// Derived Types - Convenience aliases for consumer code
// ============================================================================

/**
 * ChatThread - Thread entity derived from API response
 */
export type ChatThread = ThreadDetailData['thread'];

/**
 * ChatThreadFlexible - Partial thread with required id
 */
export type ChatThreadFlexible = {
  id: string;
} & Partial<ChatThread>;

/**
 * ChatParticipant - Participant entity alias
 */
export type ChatParticipant = ApiParticipant;

/**
 * ChatThreadChangelog - Changelog entity alias
 */
export type ChatThreadChangelog = ApiChangelog;

/**
 * ChatThreadChangelogFlexible - Partial changelog with required fields
 * Uses DbChangelogData (derived from ApiChangelog) for type-safe changeData
 */
export type ChatThreadChangelogFlexible = {
  id: string;
  changeType: string;
  changeData: DbChangelogData;
} & Partial<ChatThreadChangelog>;

/**
 * ChatSidebarItem - Sidebar thread item derived from API response
 */
export type ChatSidebarItem = Extract<
  ListSidebarThreadsResponse,
  { success: true }
> extends { data: { items: (infer T)[] } }
  ? T
  : never;

/**
 * StoredThread - Thread with participants for store storage
 */
export type StoredThread = {
  participants: ChatParticipant[];
} & ChatThread;

/**
 * ThreadStreamResumptionState - Stream resumption state from API
 */
export type ThreadStreamResumptionState = Extract<
  GetThreadStreamResumptionStateResponse,
  { success: true }
> extends { data: infer D }
  ? D
  : never;

// ============================================================================
// Message Metadata Types - Derived from RPC Response (SINGLE SOURCE OF TRUTH)
// ============================================================================

/**
 * Message metadata type derived from API response
 * Discriminated union of all metadata types
 */
export type DbMessageMetadata = NonNullable<ApiMessage['metadata']>;

/**
 * User message metadata type (discriminated union member)
 */
export type DbUserMessageMetadata = Extract<DbMessageMetadata, { role: 'user' }>;

/**
 * Base assistant message metadata extracted from discriminated union
 */
type BaseAssistantMessageMetadata = Extract<DbMessageMetadata, { role: 'assistant'; participantId: string }>;

/**
 * Assistant message metadata type (discriminated union member)
 * Excludes moderator messages - isModerator must not be true
 */
export type DbAssistantMessageMetadata = BaseAssistantMessageMetadata & {
  isModerator?: never;
};

/**
 * Pre-search message metadata type (discriminated union member)
 */
export type DbPreSearchMessageMetadata = Extract<DbMessageMetadata, { role: 'system'; isPreSearch: true }>;

/**
 * Moderator message metadata type (discriminated union member)
 */
export type DbModeratorMessageMetadata = Extract<DbMessageMetadata, { role: 'assistant'; isModerator: true }>;

/**
 * Citation type derived from assistant message metadata
 */
export type DbCitation = NonNullable<DbAssistantMessageMetadata['citations']>[number];

/**
 * Available source type derived from assistant message metadata
 */
export type AvailableSource = NonNullable<DbAssistantMessageMetadata['availableSources']>[number];

// ============================================================================
// Type Guards - Import from type-guards.ts (Pure TypeScript)
// ============================================================================

export {
  isAssistantMessageMetadata,
  isMemoryCreatedChange,
  isModeChange,
  isModeratorMessageMetadata,
  isParticipantChange,
  isParticipantMessageMetadata,
  isParticipantReorder,
  isParticipantRoleChange,
  isPreSearchMessageMetadata,
  isUserMessageMetadata,
  isWebSearchChange,
} from './type-guards';

/**
 * Participant message metadata - explicitly NOT including moderator messages.
 * Use this type when you need to access participant-specific fields.
 */
export type ParticipantMessageMetadata = DbAssistantMessageMetadata;

// ============================================================================
// API Message Types
// ============================================================================

/**
 * ApiMessageMetadata - RPC-inferred metadata type from API response
 */
export type ApiMessageMetadata = NonNullable<ApiMessage['metadata']>;

/**
 * ApiMessageParts - Parts array type derived from ApiMessage
 */
export type ApiMessageParts = ApiMessage['parts'];

/**
 * ApiMessagePart - Single part type from message parts array
 */
export type ApiMessagePart = ApiMessageParts[number];

// ============================================================================
// Changelog Data Types - Derived from ApiChangelog
// ============================================================================

/**
 * DbChangelogData - Changelog data type derived from ApiChangelog
 */
export type DbChangelogData = ApiChangelog['changeData'];
