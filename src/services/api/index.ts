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
// All messages use streaming for better UX (sendMessage endpoint removed)
// ============================================================================

export {
  type StreamChatRequest,
  type StreamChatResponse,
  streamChatService,
} from './chat-messages';

// ============================================================================
// Products Service Exports
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
  type CreatePreSearchRequest,
  createPreSearchService,
  getThreadPreSearchesService,
  type PreSearchRequest,
} from './chat-pre-search';

// ============================================================================
// Subscription Management Service Exports (Switch/Cancel)
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
// Subscriptions Service Exports
// ============================================================================

export {
  type AnalyzeRoundRequest,
  type AnalyzeRoundResponse,
  type CreateThreadRequest,
  type CreateThreadResponse,
  createThreadService,
  type DeleteThreadRequest,
  type DeleteThreadResponse,
  deleteThreadService,
  type GetPublicThreadRequest,
  type GetPublicThreadResponse,
  getPublicThreadService,
  type GetThreadAnalysesRequest,
  type GetThreadAnalysesResponse,
  getThreadAnalysesService,
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
  getThreadService,
  type GetThreadSlugStatusRequest,
  type GetThreadSlugStatusResponse,
  getThreadSlugStatusService,
  type ListThreadsRequest,
  type ListThreadsResponse,
  listThreadsService,
  type UpdateThreadRequest,
  type UpdateThreadResponse,
  updateThreadService,
} from './chat-threads';

// ============================================================================
// Usage Service Exports
// ============================================================================

export {
  type CreateCheckoutSessionRequest,
  type CreateCheckoutSessionResponse,
  createCheckoutSessionService,
  type SyncAfterCheckoutRequest,
  type SyncAfterCheckoutResponse,
  syncAfterCheckoutService,
} from './checkout';

// ============================================================================
// Chat Threads Service Exports
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
// Projects Service Exports (Updated for S3/R2 Best Practice)
// ============================================================================

export {
  // Project attachment operations (reference-based)
  type AddAttachmentToProjectRequest,
  type AddAttachmentToProjectResponse,
  addAttachmentToProjectService,
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
// Chat Custom Roles Service Exports
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
// Projects Service Exports
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
// Usage Service Exports
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
  type UploadPartRequestWithBody,
  type UploadPartResponse,
  uploadPartService,
  type UploadWithTicketRequest,
  type UploadWithTicketResponse,
  uploadWithTicketService,
  type UploadWithTicketServiceInput,
} from './uploads';

// ============================================================================
// Uploads (File Attachments) Service Exports
// ============================================================================

export {
  type GetUsageStatsRequest,
  type GetUsageStatsResponse,
  getUserUsageStatsService,
} from './usage';

// ============================================================================
// Chat Analysis Service Exports
// ============================================================================
// ✅ CONSOLIDATED: Analysis exports now part of chat-threads service
// GetThreadAnalysesRequest/Response/Service exported above from './chat-threads'
