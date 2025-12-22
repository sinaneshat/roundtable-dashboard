/**
 * Mutation Hooks - Centralized Exports
 *
 * Single import point for all TanStack Mutation hooks
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
  useCreateThreadMutation,
  useDeleteCustomRoleMutation,
  useDeleteParticipantMutation,
  useDeleteThreadMutation,
  useSetRoundFeedbackMutation,
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

// Project mutations (protected)
export {
  useAddAttachmentToProjectMutation,
  useCreateProjectMemoryMutation,
  useCreateProjectMutation,
  useDeleteProjectMemoryMutation,
  useDeleteProjectMutation,
  useRemoveAttachmentFromProjectMutation,
  useUpdateProjectAttachmentMutation,
  useUpdateProjectMemoryMutation,
  useUpdateProjectMutation,
} from './project-mutations';

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
