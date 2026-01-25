/**
 * API Services - Centralized Domain Exports
 *
 * Single source of truth for all API service functions and types
 * Organized by domain for proper segregation of concerns
 */

// ============================================================================
// Shared Types
// ============================================================================

export {
  type AdminClearUserCacheParams,
  type AdminClearUserCacheResponse,
  adminClearUserCacheService,
  type AdminSearchUserResult,
  adminSearchUserService,
  type AdminSearchUsersParams,
  type AdminSearchUsersResponse,
  // Admin Jobs
  type AutomatedJob,
  type CreateJobParams,
  type CreateJobResponse,
  createJobService,
  type DeleteJobParams,
  type DeleteJobResponse,
  deleteJobService,
  type DiscoverTrendsData,
  type DiscoverTrendsParams,
  type DiscoverTrendsResponse,
  discoverTrendsService,
  type GetJobParams,
  type GetJobResponse,
  getJobService,
  type ListJobsData,
  type ListJobsParams,
  type ListJobsResponse,
  listJobsService,
  type TrendSuggestion,
  type UpdateJobParams,
  type UpdateJobResponse,
  updateJobService,
} from './admin';

// ============================================================================
// Admin Domain Services
// ============================================================================

export {
  type ClearOwnCacheResponse,
  clearOwnCacheService,
  type CreateApiKeyRequest,
  type CreateApiKeyResponse,
  createApiKeyService,
  type DeleteApiKeyRequest,
  type DeleteApiKeyResponse,
  deleteApiKeyService,
  type GetApiKeyRequest,
  type GetApiKeyResponse,
  getApiKeyService,
  type ListApiKeysRequest,
  type ListApiKeysResponse,
  listApiKeysService,
  type UpdateApiKeyRequest,
  type UpdateApiKeyResponse,
  updateApiKeyService,
} from './auth';

// ============================================================================
// Auth Domain Services
// ============================================================================

export {
  type CancelSubscriptionRequest,
  type CancelSubscriptionResponse,
  cancelSubscriptionService,
  type CreateCheckoutSessionRequest,
  type CreateCheckoutSessionResponse,
  createCheckoutSessionService,
  type CreateCustomerPortalSessionRequest,
  type CreateCustomerPortalSessionResponse,
  createCustomerPortalSessionService,
  type GetProductRequest,
  type GetProductResponse,
  getProductService,
  getProductsService,
  type GetSubscriptionRequest,
  type GetSubscriptionResponse,
  getSubscriptionService,
  getSubscriptionsService,
  type ListProductsResponse,
  type ListSubscriptionsResponse,
  type Price,
  type Product,
  type Subscription,
  type SwitchSubscriptionRequest,
  type SwitchSubscriptionResponse,
  switchSubscriptionService,
  type SyncAfterCheckoutRequest,
  type SyncAfterCheckoutResponse,
  syncAfterCheckoutService,
} from './billing';

// ============================================================================
// Billing Domain Services
// ============================================================================

export {
  type AddParticipantRequest,
  type AddParticipantResponse,
  addParticipantService,
  type AnalyzePromptRequest,
  type AnalyzePromptResponse,
  analyzePromptStreamService,
  // API-derived types (SINGLE SOURCE OF TRUTH - RPC INFERENCE)
  type ApiChangelog,
  type ApiMessage,
  type ApiMessageMetadata,
  type ApiMessagePart,
  type ApiMessageParts,
  type ApiParticipant,
  // Derived citation/source types
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
  type CreateCustomRoleRequest,
  type CreateCustomRoleResponse,
  createCustomRoleService,
  type CreateThreadRequest,
  type CreateThreadResponse,
  createThreadService,
  type CustomRole,
  // Derived metadata types (discriminated union members)
  type DbAssistantMessageMetadata,
  // Derived changelog types
  type DbChangelogData,
  type DbCitation,
  type DbMessageMetadata,
  type DbModeratorMessageMetadata,
  type DbPreSearchMessageMetadata,
  type DbUserMessageMetadata,
  type DeleteCustomRoleRequest,
  type DeleteCustomRoleResponse,
  deleteCustomRoleService,
  type DeleteParticipantRequest,
  type DeleteParticipantResponse,
  deleteParticipantService,
  type DeleteThreadRequest,
  type DeleteThreadResponse,
  deleteThreadService,
  executePreSearchStreamService,
  // Pre-search data types
  type GeneratedSearchQuery,
  type GetCustomRoleRequest,
  type GetCustomRoleResponse,
  getCustomRoleService,
  type GetPublicThreadRequest,
  type GetPublicThreadResponse,
  getPublicThreadService,
  type GetThreadBySlugRequest,
  type GetThreadBySlugResponse,
  getThreadBySlugService,
  type GetThreadChangelogRequest,
  type GetThreadChangelogResponse,
  getThreadChangelogService,
  type GetThreadFeedbackRequest,
  type GetThreadFeedbackResponse,
  getThreadFeedbackService,
  type GetThreadMemoryEventsRequest,
  type GetThreadMemoryEventsResponse,
  getThreadMemoryEventsService,
  type GetThreadMessagesRequest,
  type GetThreadMessagesResponse,
  getThreadMessagesService,
  type GetThreadPreSearchesRequest,
  type GetThreadPreSearchesResponse,
  getThreadPreSearchesService,
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
  // Type guards (Pure TypeScript - no Zod)
  isAssistantMessageMetadata,
  isModeChange,
  isModeratorMessageMetadata,
  isParticipantChange,
  isParticipantMessageMetadata,
  isParticipantRoleChange,
  isPreSearchMessageMetadata,
  isUserMessageMetadata,
  isWebSearchChange,
  type ListCustomRolesRequest,
  type ListCustomRolesResponse,
  listCustomRolesService,
  type ListPublicThreadSlugsResponse,
  listPublicThreadSlugsService,
  type ListSidebarThreadsRequest,
  type ListSidebarThreadsResponse,
  listSidebarThreadsService,
  type ListThreadsRequest,
  type ListThreadsResponse,
  listThreadsService,
  type PartialPreSearchData,
  type PreSearchDataPayload,
  type PreSearchQuery,
  type PreSearchRequest,
  type PreSearchResponse,
  type PreSearchResult,
  type PublicThreadData,
  type RoundFeedbackData,
  type SetRoundFeedbackRequest,
  type SetRoundFeedbackResponse,
  setRoundFeedbackService,
  type StoredPreSearch,
  type StoredThread,
  type StreamChatRequest,
  type StreamChatResponse,
  streamChatService,
  type StreamModeratorRequest,
  type StreamModeratorResponse,
  streamModeratorService,
  type ThreadDetailData,
  type ThreadStreamResumptionState,
  type UpdateCustomRoleRequest,
  type UpdateCustomRoleResponse,
  updateCustomRoleService,
  type UpdateParticipantRequest,
  type UpdateParticipantResponse,
  updateParticipantService,
  type UpdateThreadRequest,
  type UpdateThreadResponse,
  updateThreadService,
  type WebSearchResultItem,
} from './chat';

// ============================================================================
// Chat Domain Services
// ============================================================================

// Pre-search validation schema from chat service
export {
  StoredPreSearchSchema,
  type StoredPreSearchValidated,
} from './chat/pre-search';

// ============================================================================
// Presets Domain Services
// ============================================================================

export {
  listModelsPublicService,
  type ListModelsResponse,
  listModelsService,
  type Model,
} from './models';

// ============================================================================
// Projects Domain Services
// ============================================================================

export {
  type CreateUserPresetRequest,
  type CreateUserPresetResponse,
  createUserPresetService,
  type DeleteUserPresetRequest,
  type DeleteUserPresetResponse,
  deleteUserPresetService,
  type GetUserPresetRequest,
  type GetUserPresetResponse,
  getUserPresetService,
  type ListUserPresetsRequest,
  type ListUserPresetsResponse,
  listUserPresetsService,
  type UpdateUserPresetRequest,
  type UpdateUserPresetResponse,
  updateUserPresetService,
  type UserPreset,
} from './presets';

// ============================================================================
// User Presets Domain Services
// ============================================================================

export {
  type AddUploadToProjectRequest,
  type AddUploadToProjectResponse,
  addUploadToProjectService,
  type CreateProjectMemoryRequest,
  type CreateProjectMemoryResponse,
  createProjectMemoryService,
  type CreateProjectRequest,
  type CreateProjectResponse,
  createProjectService,
  type DeleteProjectMemoryRequest,
  type DeleteProjectMemoryResponse,
  deleteProjectMemoryService,
  type DeleteProjectRequest,
  type DeleteProjectResponse,
  deleteProjectService,
  type GetProjectAttachmentRequest,
  type GetProjectAttachmentResponse,
  getProjectAttachmentService,
  type GetProjectContextRequest,
  type GetProjectContextResponse,
  getProjectContextService,
  type GetProjectLimitsResponse,
  getProjectLimitsService,
  type GetProjectMemoryRequest,
  type GetProjectMemoryResponse,
  getProjectMemoryService,
  type GetProjectRequest,
  type GetProjectResponse,
  getProjectService,
  type ListProjectAttachmentsQuery,
  type ListProjectAttachmentsRequest,
  type ListProjectAttachmentsResponse,
  listProjectAttachmentsService,
  type ListProjectMemoriesQuery,
  type ListProjectMemoriesRequest,
  type ListProjectMemoriesResponse,
  listProjectMemoriesService,
  type ListProjectsRequest,
  type ListProjectsResponse,
  listProjectsService,
  type ProjectAttachmentItem,
  type ProjectDetail,
  type ProjectLimits,
  type ProjectListItem,
  type RemoveAttachmentFromProjectRequest,
  type RemoveAttachmentFromProjectResponse,
  removeAttachmentFromProjectService,
  type UpdateProjectAttachmentRequest,
  type UpdateProjectAttachmentResponse,
  updateProjectAttachmentService,
  type UpdateProjectMemoryRequest,
  type UpdateProjectMemoryResponse,
  updateProjectMemoryService,
  type UpdateProjectRequest,
  type UpdateProjectResponse,
  updateProjectService,
} from './projects';

// ============================================================================
// Usage Domain Services
// ============================================================================

export type { ServiceOptions } from './types';

// ============================================================================
// Feedback Domain Services
// ============================================================================

export {
  type AbortMultipartUploadRequest,
  type AbortMultipartUploadResponse,
  abortMultipartUploadService,
  type CompleteMultipartUploadRequest,
  type CompleteMultipartUploadResponse,
  completeMultipartUploadService,
  type CreateMultipartUploadRequest,
  type CreateMultipartUploadResponse,
  createMultipartUploadService,
  type DeleteAttachmentRequest,
  type DeleteAttachmentResponse,
  deleteAttachmentService,
  type GetAttachmentRequest,
  type GetAttachmentResponse,
  getAttachmentService,
  type GetDownloadUrlRequest,
  type GetDownloadUrlResponse,
  getDownloadUrlService,
  type ListAttachmentsRequest,
  type ListAttachmentsResponse,
  listAttachmentsService,
  type RequestUploadTicketRequest,
  type RequestUploadTicketResponse,
  requestUploadTicketService,
  secureUploadService,
  type UpdateAttachmentRequest,
  type UpdateAttachmentResponse,
  updateAttachmentService,
  type UploadPartResponse,
  uploadPartService,
  type UploadPartServiceInput,
  type UploadWithTicketResponse,
  uploadWithTicketService,
} from './uploads';

// ============================================================================
// Validation Schemas - Re-exported from single sources of truth
// ============================================================================

export {
  type GetUsageStatsResponse,
  getUserUsageStatsService,
} from './usage';

// ============================================================================
// Streaming Validation Schemas - Only for SSE Parsing
// ============================================================================

export {
  type AnalyzePromptPayload,
  AnalyzePromptPayloadSchema,
  type ModeratorPayload,
  ModeratorPayloadSchema,
  PartialPreSearchDataSchema,
  PreSearchDataPayloadSchema,
  PreSearchQuerySchema,
  PreSearchResultSchema,
  type RecommendedParticipant,
  RecommendedParticipantSchema,
  type Usage,
  UsageSchema,
  WebSearchResultItemSchema,
} from '@roundtable/shared/validation';
