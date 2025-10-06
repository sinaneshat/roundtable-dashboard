/**
 * API Services - Centralized Exports
 *
 * Single import point for all API service functions and types
 * Follows the pattern from commit a24d1f67d90381a2e181818f93b6a7ad63c062cc
 */

// ============================================================================
// Chat Memories Service Exports
// ============================================================================

export {
    createMemoryService, deleteMemoryService, getMemoryService, listMemoriesService, updateMemoryService, type CreateMemoryRequest,
    type CreateMemoryResponse, type DeleteMemoryRequest,
    type DeleteMemoryResponse, type GetMemoryRequest,
    type GetMemoryResponse, type ListMemoriesRequest,
    type ListMemoriesResponse, type MemoryType,
    type UpdateMemoryRequest,
    type UpdateMemoryResponse
} from './chat-memories';

// ============================================================================
// Chat Messages Service Exports
// All messages use streaming for better UX (sendMessage endpoint removed)
// ============================================================================

export {
    streamChatService, type StreamChatRequest,
    type StreamChatResponse
} from './chat-messages';

// ============================================================================
// Products Service Exports
// ============================================================================

export {
    addParticipantService, deleteParticipantService, updateParticipantService, type AddParticipantRequest,
    type AddParticipantResponse, type DeleteParticipantRequest,
    type DeleteParticipantResponse, type UpdateParticipantRequest,
    type UpdateParticipantResponse
} from './chat-participants';

// ============================================================================
// Subscription Management Service Exports (Switch/Cancel)
// ============================================================================

export {
    createCustomRoleService, deleteCustomRoleService, getCustomRoleService, listCustomRolesService, updateCustomRoleService, type CreateCustomRoleRequest,
    type CreateCustomRoleResponse, type DeleteCustomRoleRequest,
    type DeleteCustomRoleResponse, type GetCustomRoleRequest,
    type GetCustomRoleResponse, type ListCustomRolesRequest,
    type ListCustomRolesResponse, type UpdateCustomRoleRequest,
    type UpdateCustomRoleResponse
} from './chat-roles';

// ============================================================================
// Subscriptions Service Exports
// ============================================================================

export {
    createThreadService, deleteThreadService, getPublicThreadService,
    getThreadBySlugService, getThreadService, listThreadsService, updateThreadService, type CreateThreadRequest,
    type CreateThreadResponse, type DeleteThreadRequest,
    type DeleteThreadResponse, type GetPublicThreadRequest,
    type GetPublicThreadResponse, type GetThreadRequest,
    type GetThreadResponse, type ListThreadsRequest,
    type ListThreadsResponse, type ThreadMode,
    type UpdateThreadRequest,
    type UpdateThreadResponse
} from './chat-threads';

// ============================================================================
// Usage Service Exports
// ============================================================================

export {
    createCheckoutSessionService, syncAfterCheckoutService, type CreateCheckoutSessionRequest,
    type CreateCheckoutSessionResponse, type SyncAfterCheckoutRequest,
    type SyncAfterCheckoutResponse
} from './checkout';

// ============================================================================
// Chat Threads Service Exports
// ============================================================================

export {
    createCustomerPortalSessionService, type CreateCustomerPortalSessionRequest,
    type CreateCustomerPortalSessionResponse
} from './customer-portal';

// ============================================================================
// Chat Messages Service Exports
// ============================================================================

export {
    getProductService, getProductsService, type GetProductRequest,
    type GetProductResponse, type GetProductsRequest,
    type GetProductsResponse
} from './products';

// ============================================================================
// Chat Participants Service Exports
// ============================================================================

export {
    cancelSubscriptionService, switchSubscriptionService, type CancelSubscriptionRequest,
    type CancelSubscriptionResponse, type SwitchSubscriptionRequest,
    type SwitchSubscriptionResponse
} from './subscription-management';

// ============================================================================
// Chat Memories Service Exports
// ============================================================================

export {
    getSubscriptionService, getSubscriptionsService, type GetSubscriptionRequest,
    type GetSubscriptionResponse, type GetSubscriptionsRequest,
    type GetSubscriptionsResponse
} from './subscriptions';

// ============================================================================
// Chat Custom Roles Service Exports
// ============================================================================

export {
    checkMessageQuotaService, checkThreadQuotaService, getUserUsageStatsService, type CheckMessageQuotaRequest,
    type CheckMessageQuotaResponse, type CheckThreadQuotaRequest,
    type CheckThreadQuotaResponse, type GetUsageStatsRequest,
    type GetUsageStatsResponse
} from './usage';

