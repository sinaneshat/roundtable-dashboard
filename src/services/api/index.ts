/**
 * API Services - Centralized Exports
 *
 * Single import point for all API service functions and types
 * Follows the pattern from commit a24d1f67d90381a2e181818f93b6a7ad63c062cc
 */

// ============================================================================
// API Keys Service Exports
// ============================================================================

export {
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
} from './api-keys';

// ============================================================================
// Chat Feedback Service Exports
// ============================================================================

export {
  type GetThreadFeedbackRequest,
  type GetThreadFeedbackResponse,
  getThreadFeedbackService,
  type SetRoundFeedbackRequest,
  type SetRoundFeedbackResponse,
  setRoundFeedbackService,
} from './chat-feedback';

// ============================================================================
// Chat Messages Service Exports
// ============================================================================

export {
  type StreamChatRequest,
  type StreamChatResponse,
  streamChatService,
} from './chat-messages';

// ============================================================================
// Chat Participants Service Exports
// ============================================================================

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
} from './chat-participants';

// ============================================================================
// Chat Pre-Search Service Exports
// ============================================================================

export {
  executePreSearchStreamService,
  type GetThreadPreSearchesRequest,
  type GetThreadPreSearchesResponse,
  getThreadPreSearchesService,
  type PreSearchRequest,
  type PreSearchResponse,
} from './chat-pre-search';

// ============================================================================
// AI SDK Resume Pattern - No separate resume service needed
// ============================================================================
// Per AI SDK docs, stream resumption is handled via GET /stream endpoint
// which is called automatically by useChat with resume: true.
// No separate /resume service call is needed from the frontend.

// ============================================================================
// Chat Custom Roles Service Exports
// ============================================================================

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
} from './chat-roles';

// ============================================================================
// Chat Threads Service Exports
// ============================================================================

export {
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
  type ListThreadsRequest,
  type ListThreadsResponse,
  listThreadsService,
  type SummarizeRoundRequest,
  type SummarizeRoundResponse,
  type UpdateThreadRequest,
  type UpdateThreadResponse,
  updateThreadService,
} from './chat-threads';

// ============================================================================
// Checkout Service Exports
// ============================================================================

export {
  type CreateCheckoutSessionRequest,
  type CreateCheckoutSessionResponse,
  createCheckoutSessionService,
  type SyncAfterCheckoutRequest,
  type SyncAfterCheckoutResponse,
  syncAfterCheckoutService,
  type SyncCreditsAfterCheckoutRequest,
  type SyncCreditsAfterCheckoutResponse,
  syncCreditsAfterCheckoutService,
} from './checkout';

// ============================================================================
// Customer Portal Service Exports
// ============================================================================

export {
  type CreateCustomerPortalSessionRequest,
  type CreateCustomerPortalSessionResponse,
  createCustomerPortalSessionService,
} from './customer-portal';

// ============================================================================
// Models Service Exports
// ============================================================================

export {
  listModelsPublicService,
  type ListModelsResponse,
  listModelsService,
} from './models';

// ============================================================================
// Products Service Exports
// ============================================================================

export {
  type GetProductRequest,
  type GetProductResponse,
  getProductService,
  type GetProductsRequest,
  type GetProductsResponse,
  getProductsService,
} from './products';

// ============================================================================
// Projects Service Exports
// ============================================================================

export {
  // Project attachment operations (reference-based)
  type AddUploadToProjectRequest,
  type AddUploadToProjectResponse,
  addUploadToProjectService,
  // Project memory operations
  type CreateProjectMemoryRequest,
  type CreateProjectMemoryResponse,
  createProjectMemoryService,
  // Project operations
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
  // Project context (RAG aggregation)
  type GetProjectContextRequest,
  type GetProjectContextResponse,
  getProjectContextService,
  type GetProjectMemoryRequest,
  type GetProjectMemoryResponse,
  getProjectMemoryService,
  type GetProjectRequest,
  type GetProjectResponse,
  getProjectService,
  type ListProjectAttachmentsRequest,
  type ListProjectAttachmentsResponse,
  listProjectAttachmentsService,
  type ListProjectMemoriesRequest,
  type ListProjectMemoriesResponse,
  listProjectMemoriesService,
  type ListProjectsRequest,
  type ListProjectsResponse,
  listProjectsService,
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
// Subscription Management Service Exports
// ============================================================================

export {
  type CancelSubscriptionRequest,
  type CancelSubscriptionResponse,
  cancelSubscriptionService,
  type SwitchSubscriptionRequest,
  type SwitchSubscriptionResponse,
  switchSubscriptionService,
} from './subscription-management';

// ============================================================================
// Subscriptions Service Exports
// ============================================================================

export {
  type GetSubscriptionRequest,
  type GetSubscriptionResponse,
  getSubscriptionService,
  type GetSubscriptionsRequest,
  type GetSubscriptionsResponse,
  getSubscriptionsService,
} from './subscriptions';

// ============================================================================
// Uploads Service Exports
// ============================================================================

export {
  // Multipart upload services
  type AbortMultipartUploadRequest,
  type AbortMultipartUploadResponse,
  abortMultipartUploadService,
  type CompleteMultipartUploadRequest,
  type CompleteMultipartUploadResponse,
  completeMultipartUploadService,
  type CreateMultipartUploadRequest,
  type CreateMultipartUploadResponse,
  createMultipartUploadService,
  // Upload management services
  type DeleteAttachmentRequest,
  type DeleteAttachmentResponse,
  deleteAttachmentService,
  type GetAttachmentRequest,
  type GetAttachmentResponse,
  getAttachmentService,
  // Download URL service
  type GetDownloadUrlRequest,
  type GetDownloadUrlResponse,
  getDownloadUrlService,
  type ListAttachmentsRequest,
  type ListAttachmentsResponse,
  listAttachmentsService,
  // Secure ticket-based upload services (S3 presigned URL pattern)
  type RequestUploadTicketRequest,
  type RequestUploadTicketResponse,
  requestUploadTicketService,
  secureUploadService,
  type UpdateAttachmentRequest,
  type UpdateAttachmentResponse,
  updateAttachmentService,
  type UploadPartRequest,
  type UploadPartResponse,
  uploadPartService,
  type UploadPartServiceInput,
  type UploadWithTicketRequest,
  type UploadWithTicketResponse,
  uploadWithTicketService,
} from './uploads';

// ============================================================================
// Usage Service Exports
// ============================================================================

export {
  type GetUsageStatsRequest,
  type GetUsageStatsResponse,
  getUserUsageStatsService,
} from './usage';

// ============================================================================
// User Presets Service Exports
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
} from './user-presets';
