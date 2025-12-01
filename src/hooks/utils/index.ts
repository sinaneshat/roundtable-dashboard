/**
 * Utility Hooks - General Purpose
 *
 * These hooks are reusable utilities not specific to any store.
 * Store-specific action hooks have been moved to @/stores/{feature}/actions/
 *
 * Zustand v5 Pattern: Co-locate store actions with stores, keep utilities here
 */

export { useAutoResizeTextarea } from './use-auto-resize-textarea';
export type { UseAutoScrollOptions, UseAutoScrollWithTriggerReturn } from './use-auto-scroll';
export { useAutoScroll, useAutoScrollWithTrigger } from './use-auto-scroll';
export { useBoolean } from './use-boolean';
export type { PendingAttachment, UseChatAttachmentsReturn } from './use-chat-attachments';
export { PendingAttachmentSchema, useChatAttachments } from './use-chat-attachments';
export { useDebouncedValue } from './use-debounced-value';
// Drag and drop utilities
export type { UseDragDropReturn } from './use-drag-drop';
export { useDragDrop } from './use-drag-drop';
// File Upload Utilities
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
// Note: UploadStatus type should be imported from @/api/core/enums
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
export type { UseFlowLoadingOptions, UseFlowLoadingReturn } from './use-flow-loading';
export { useFlowLoading } from './use-flow-loading';
export { useFuzzySearch } from './use-fuzzy-search';
export { useKeyboardAwareScroll } from './use-keyboard-aware-scroll';
export { useMediaQuery } from './use-media-query';
export type { UseMessagePartsOptions, UseMessagePartsReturn } from './use-message-parts';
export { useMessageParts } from './use-message-parts';
export { useIsMobile } from './use-mobile';
export type { UseModelLookupReturn } from './use-model-lookup';
export { useModelLookup } from './use-model-lookup';
export { useMultiParticipantChat } from './use-multi-participant-chat';
export { useSelectedParticipants } from './use-selected-participants';
export { useSortedParticipants } from './use-sorted-participants';
export type { UseSpeechRecognitionOptions } from './use-speech-recognition';
export { useSpeechRecognition } from './use-speech-recognition';
export { useSyncedRefs } from './use-synced-refs';
export { toast, useToast } from './use-toast';
export { useTouchDevice } from './use-touch-device';
export { useVisualViewportPosition } from './use-visual-viewport-position';
export { useChatScroll } from './useChatScroll';
export type { TimelineItem, UseThreadTimelineOptions } from './useThreadTimeline';
export { useThreadTimeline } from './useThreadTimeline';
export type { UseVirtualizedTimelineOptions, UseVirtualizedTimelineResult } from './useVirtualizedTimeline';
export { useVirtualizedTimeline } from './useVirtualizedTimeline';
// Note: getMessageParts should be imported directly from '@/lib/utils/message-status'
