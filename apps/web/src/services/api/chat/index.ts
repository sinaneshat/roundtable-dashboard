/**
 * Chat Services - Domain Barrel Export
 *
 * Single source of truth for all chat-related API services
 * Matches backend route structure: /api/v1/chat/*
 */

// Feedback
export {
  type GetThreadFeedbackRequest,
  type GetThreadFeedbackResponse,
  getThreadFeedbackService,
  type RoundFeedbackData,
  type SetRoundFeedbackRequest,
  type SetRoundFeedbackResponse,
  setRoundFeedbackService,
} from './feedback';

// Messages (Streaming)
export {
  type StreamChatRequest,
  type StreamChatResponse,
  streamChatService,
} from './messages';

// Moderator (Streaming)
export {
  type StreamModeratorRequest,
  type StreamModeratorResponse,
  streamModeratorService,
} from './moderator';

// Participants
export {
  type AddParticipantRequest,
  type AddParticipantResponse,
  addParticipantService,
  type DeleteParticipantRequest,
  type DeleteParticipantResponse,
  deleteParticipantService,
  type UpdateParticipantRequest,
  type UpdateParticipantResponse,
  updateParticipantService,
} from './participants';

// Pre-Search
export {
  executePreSearchStreamService,
  type GeneratedSearchQuery,
  type GetThreadPreSearchesRequest,
  type GetThreadPreSearchesResponse,
  getThreadPreSearchesService,
  type PartialPreSearchData,
  type PreSearchDataPayload,
  type PreSearchQuery,
  type PreSearchRequest,
  type PreSearchResponse,
  type PreSearchResult,
  type StoredPreSearch,
  StoredPreSearchSchema,
  type StoredPreSearchValidated,
  type WebSearchResultItem,
} from './pre-search';

// Custom Roles
export {
  type CreateCustomRoleRequest,
  type CreateCustomRoleResponse,
  createCustomRoleService,
  type CustomRole,
  type DeleteCustomRoleRequest,
  type DeleteCustomRoleResponse,
  deleteCustomRoleService,
  type GetCustomRoleRequest,
  type GetCustomRoleResponse,
  getCustomRoleService,
  type ListCustomRolesRequest,
  type ListCustomRolesResponse,
  listCustomRolesService,
  type UpdateCustomRoleRequest,
  type UpdateCustomRoleResponse,
  updateCustomRoleService,
} from './roles';

// Type Guards (Zod-based .safeParse() validation - from threads.ts)
export {
  isAssistantMessageMetadata,
  isModeChange,
  isModeratorMessageMetadata,
  isParticipantChange,
  isParticipantMessageMetadata,
  isParticipantRoleChange,
  isPreSearchMessageMetadata,
  isUserMessageMetadata,
  isWebSearchChange,
  type ParticipantMessageMetadata,
} from './threads';

// Threads (including Auto Mode)
export {
  type AnalyzePromptRequest,
  type AnalyzePromptResponse,
  analyzePromptStreamService,
  // Type extractions derived from API response (SINGLE SOURCE OF TRUTH)
  type ApiChangelog,
  type ApiMessage,
  type ApiMessageMetadata,
  type ApiMessagePart,
  type ApiMessageParts,
  type ApiParticipant,
  // Derived citation/source types from metadata
  type AvailableSource,
  type ChangelogItem,
  type ChangelogListData,
  // Derived convenience types
  type ChatParticipant,
  type ChatSidebarItem,
  type ChatThread,
  type ChatThreadChangelog,
  type ChatThreadChangelogFlexible,
  type ChatThreadFlexible,
  type CreateThreadRequest,
  type CreateThreadResponse,
  createThreadService,
  // Derived metadata types (discriminated union members)
  type DbAssistantMessageMetadata,
  // Derived changelog types
  type DbChangelogData,
  type DbCitation,
  type DbMessageMetadata,
  type DbModeratorMessageMetadata,
  type DbPreSearchMessageMetadata,
  type DbUserMessageMetadata,
  type DeleteThreadRequest,
  type DeleteThreadResponse,
  deleteThreadService,
  type GetPublicThreadRequest,
  type GetPublicThreadResponse,
  getPublicThreadService,
  type GetThreadBySlugRequest,
  type GetThreadBySlugResponse,
  getThreadBySlugService,
  type GetThreadChangelogRequest,
  type GetThreadChangelogResponse,
  getThreadChangelogService,
  type GetThreadMemoryEventsRequest,
  type GetThreadMemoryEventsResponse,
  getThreadMemoryEventsService,
  type GetThreadMessagesRequest,
  type GetThreadMessagesResponse,
  getThreadMessagesService,
  type GetThreadRequest,
  type GetThreadResponse,
  type GetThreadRoundChangelogRequest,
  type GetThreadRoundChangelogResponse,
  getThreadRoundChangelogService,
  getThreadService,
  type GetThreadSlugStatusRequest,
  type GetThreadSlugStatusResponse,
  getThreadSlugStatusService,
  type GetThreadStreamResumptionStateRequest,
  type GetThreadStreamResumptionStateResponse,
  getThreadStreamResumptionStateService,
  type ListPublicThreadSlugsResponse,
  listPublicThreadSlugsService,
  type ListSidebarThreadsRequest,
  type ListSidebarThreadsResponse,
  listSidebarThreadsService,
  type ListThreadsRequest,
  type ListThreadsResponse,
  listThreadsService,
  type PublicThreadData,
  type StoredThread,
  type ThreadDetailData,
  type ThreadStreamResumptionState,
  type UpdateThreadRequest,
  type UpdateThreadResponse,
  updateThreadService,
} from './threads';
