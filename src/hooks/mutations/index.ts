/**
 * Mutation Hooks - Centralized Exports
 *
 * Single import point for all TanStack Mutation hooks
 * Following patterns from commit a24d1f67d90381a2e181818f93b6a7ad63c062cc
 */

// ============================================================================
// MUTATION HOOKS BY DOMAIN
// ============================================================================

// API Key mutations (protected)
export {
  useCreateApiKeyMutation,
  useDeleteApiKeyMutation,
  useUpdateApiKeyMutation,
} from './api-key-mutations';

// Chat mutations (protected) - All chat-related operations
export {
  useAddParticipantMutation,
  useCreateCustomRoleMutation,
  useCreatePreSearchMutation,
  useCreateThreadMutation,
  useDeleteCustomRoleMutation,
  useDeleteParticipantMutation,
  useDeleteThreadMutation,
  useToggleFavoriteMutation,
  useTogglePublicMutation,
  useUpdateCustomRoleMutation,
  useUpdateParticipantMutation,
  useUpdateThreadMutation,
} from './chat-mutations';

// Checkout mutations (protected)
export {
  useCreateCheckoutSessionMutation,
  useSyncAfterCheckoutMutation,
} from './checkout';

// Customer Portal mutations (protected) - For payment method management and invoices
export {
  useCreateCustomerPortalSessionMutation,
} from './customer-portal';

// Subscription Management mutations (protected) - In-app subscription changes
export {
  useCancelSubscriptionMutation,
  useSwitchSubscriptionMutation,
} from './subscription-management';

// Upload (attachment) mutations (protected)
export {
  // Multipart upload lifecycle
  useAbortMultipartUploadMutation,
  useCompleteMultipartUploadMutation,
  useCreateMultipartUploadMutation,
  // Single-request uploads
  useDeleteAttachmentMutation,
  useMultipartUpload,
  useSecureUploadMutation,
  useUpdateAttachmentMutation,
  useUploadPartMutation,
} from './upload-mutations';
