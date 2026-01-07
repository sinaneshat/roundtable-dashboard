/**
 * API Services - Centralized Domain Exports
 *
 * Single source of truth for all API service functions and types
 * Organized by domain for proper segregation of concerns
 */

// ============================================================================
// Auth Domain Services
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
} from './auth';

// ============================================================================
// Billing Domain Services
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
  type GetProductsRequest,
  type GetProductsResponse,
  getProductsService,
  type GetSubscriptionRequest,
  type GetSubscriptionResponse,
  getSubscriptionService,
  type GetSubscriptionsRequest,
  type GetSubscriptionsResponse,
  getSubscriptionsService,
  type SwitchSubscriptionRequest,
  type SwitchSubscriptionResponse,
  switchSubscriptionService,
  type SyncAfterCheckoutRequest,
  type SyncAfterCheckoutResponse,
  syncAfterCheckoutService,
} from './billing';

// ============================================================================
// Chat Domain Services
// ============================================================================

export {
  type AddParticipantRequest,
  type AddParticipantResponse,
  addParticipantService,
  type CreateCustomRoleRequest,
  type CreateCustomRoleResponse,
  createCustomRoleService,
  type CreateThreadRequest,
  type CreateThreadResponse,
  createThreadService,
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
  type ListCustomRolesRequest,
  type ListCustomRolesResponse,
  listCustomRolesService,
  type ListPublicThreadSlugsResponse,
  listPublicThreadSlugsService,
  type ListThreadsRequest,
  type ListThreadsResponse,
  listThreadsService,
  type PreSearchRequest,
  type PreSearchResponse,
  type SetRoundFeedbackRequest,
  type SetRoundFeedbackResponse,
  setRoundFeedbackService,
  type StreamChatRequest,
  type StreamChatResponse,
  streamChatService,
  type SummarizeRoundRequest,
  type SummarizeRoundResponse,
  type UpdateCustomRoleRequest,
  type UpdateCustomRoleResponse,
  updateCustomRoleService,
  type UpdateParticipantRequest,
  type UpdateParticipantResponse,
  updateParticipantService,
  type UpdateThreadRequest,
  type UpdateThreadResponse,
  updateThreadService,
} from './chat';

// ============================================================================
// Models Domain Services
// ============================================================================

export {
  listModelsPublicService,
  type ListModelsResponse,
  listModelsService,
} from './models';

// ============================================================================
// Presets Domain Services
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
} from './presets';

// ============================================================================
// Projects Domain Services
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
// Uploads Domain Services
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
  type UploadPartRequest,
  type UploadPartResponse,
  uploadPartService,
  type UploadPartServiceInput,
  type UploadWithTicketRequest,
  type UploadWithTicketResponse,
  uploadWithTicketService,
} from './uploads';

// ============================================================================
// Usage Domain Services
// ============================================================================

export {
  type GetUsageStatsRequest,
  type GetUsageStatsResponse,
  getUserUsageStatsService,
} from './usage';
