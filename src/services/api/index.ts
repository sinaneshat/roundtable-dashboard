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
  type ListApiKeysResponse,
  listApiKeysService,
  type UpdateApiKeyRequest,
  type UpdateApiKeyResponse,
  updateApiKeyService,
} from './api-keys';

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
  type CreateThreadRequest,
  type CreateThreadResponse,
  createThreadService,
  type DeleteThreadRequest,
  type DeleteThreadResponse,
  deleteThreadService,
  type GetPublicThreadRequest,
  type GetPublicThreadResponse,
  getPublicThreadService,
  getThreadAnalysesService,
  getThreadBySlugService,
  getThreadChangelogService,
  getThreadMessagesService,
  type GetThreadRequest,
  type GetThreadResponse,
  getThreadService,
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
// Message Variants Service Exports
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
// Chat Custom Roles Service Exports
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
// Models Service Exports (Dynamic OpenRouter Models)
// ============================================================================

export {
  type CheckMessageQuotaRequest,
  type CheckMessageQuotaResponse,
  checkMessageQuotaService,
  type CheckThreadQuotaRequest,
  type CheckThreadQuotaResponse,
  checkThreadQuotaService,
  type GetUsageStatsRequest,
  type GetUsageStatsResponse,
  getUserUsageStatsService,
} from './usage';
