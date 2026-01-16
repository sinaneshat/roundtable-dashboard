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
  type GetThreadPreSearchesRequest,
  type GetThreadPreSearchesResponse,
  getThreadPreSearchesService,
  type PreSearchRequest,
  type PreSearchResponse,
} from './pre-search';

// Custom Roles
export {
  type CreateCustomRoleRequest,
  type CreateCustomRoleResponse,
  createCustomRoleService,
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

// Threads (including Auto Mode)
export {
  type AnalyzePromptRequest,
  type AnalyzePromptResponse,
  analyzePromptStreamService,
  type CreateThreadRequest,
  type CreateThreadResponse,
  createThreadService,
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
  type SummarizeRoundRequest,
  type SummarizeRoundResponse,
  type UpdateThreadRequest,
  type UpdateThreadResponse,
  updateThreadService,
} from './threads';
