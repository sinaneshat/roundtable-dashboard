/**
 * Utility Hooks - General Purpose
 *
 * Reusable utilities not specific to any store or domain.
 * Store-specific action hooks live in @/stores/{domain}/actions/
 *
 * Pattern: Utilities here, domain logic in stores
 */

export { useAutoResizeTextarea } from './use-auto-resize-textarea';
export { useBoolean } from './use-boolean';
export type { PendingAttachment, UseChatAttachmentsReturn } from './use-chat-attachments';
export { PendingAttachmentSchema, useChatAttachments } from './use-chat-attachments';
export type { UseCountdownRedirectOptions, UseCountdownRedirectReturn } from './use-countdown-redirect';
export { useCountdownRedirect } from './use-countdown-redirect';
export { useCurrentPathname } from './use-current-pathname';
export { useDebouncedValue } from './use-debounced-value';
export type { UseDragDropReturn } from './use-drag-drop';
export { useDragDrop } from './use-drag-drop';
export { useElapsedTime } from './use-elapsed-time';
export type { FilePreview, UseFilePreviewOptions, UseFilePreviewReturn } from './use-file-preview';
export { FilePreviewSchema, getFileIconName, getFileTypeLabel, supportsInlinePreview, useFilePreview, UseFilePreviewOptionsSchema } from './use-file-preview';
export type {
  UploadItem,
  UploadProgress,
  UseFileUploadOptions,
  UseFileUploadReturn,
  UseSingleFileUploadOptions,
  UseSingleFileUploadReturn,
} from './use-file-upload';
export {
  UploadItemSchema,
  UploadProgressSchema,
  useFileUpload,
  UseFileUploadOptionsSchema,
  useSingleFileUpload,
  UseSingleFileUploadOptionsSchema,
} from './use-file-upload';
export type { FileValidationError, FileValidationResult, UseFileValidationOptions, UseFileValidationReturn } from './use-file-validation';
export {
  FileValidationErrorSchema,
  FileValidationResultSchema,
  useFileValidation,
  UseFileValidationOptionsSchema,
} from './use-file-validation';
export { useKeyboardAwareScroll } from './use-keyboard-aware-scroll';
export { useMediaQuery } from './use-media-query';
export type { UseMessagePartsOptions } from './use-message-parts';
export { useMessageParts } from './use-message-parts';
export { useIsMobile } from './use-mobile';
export type { UseModelLookupReturn } from './use-model-lookup';
export { useModelLookup } from './use-model-lookup';
export { useMultiParticipantChat } from './use-multi-participant-chat';
export type { UseOrderedModelsOptions } from './use-ordered-models';
export { useOrderedModels } from './use-ordered-models';
export type { UseSpeechRecognitionOptions } from './use-speech-recognition';
export { useSpeechRecognition } from './use-speech-recognition';
export { useSyncedRefs } from './use-synced-refs';
export { useIsFirstRender, useTimelineAnimations } from './use-timeline-animations';
export { toast, useToast } from './use-toast';
export { useVisualViewportPosition } from './use-visual-viewport-position';
export { useChatScroll } from './useChatScroll';
export type { ModeratorStreamState } from './useModeratorStream';
export { useModeratorStream } from './useModeratorStream';
export type { TimelineItem, UseThreadTimelineOptions } from './useThreadTimeline';
export { useThreadTimeline } from './useThreadTimeline';
export type { UseVirtualizedTimelineOptions, UseVirtualizedTimelineResult } from './useVirtualizedTimeline';
export { useVirtualizedTimeline } from './useVirtualizedTimeline';
