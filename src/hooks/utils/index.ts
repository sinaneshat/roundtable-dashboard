/**
 * Utility Hooks - General Purpose
 *
 * These hooks are reusable utilities not specific to any store.
 * Store-specific action hooks have been moved to @/stores/{feature}/actions/
 *
 * Zustand v5 Pattern: Co-locate store actions with stores, keep utilities here
 */

export { useAutoResizeTextarea } from './use-auto-resize-textarea';
export { useBoolean } from './use-boolean';
export { useDebouncedValue } from './use-debounced-value';
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
export type { UseSpeechRecognitionOptions } from './use-speech-recognition';
export { useSpeechRecognition } from './use-speech-recognition';
export { useSyncedMessageRefs } from './use-synced-message-refs';
export { useSyncedRefs } from './use-synced-refs';
export { toast, useToast } from './use-toast';
export { useTouchDevice } from './use-touch-device';
export { useVisualViewportPosition } from './use-visual-viewport-position';
export { useChatScroll } from './useChatScroll';
export type { TimelineItem, UseThreadTimelineOptions } from './useThreadTimeline';
export { useThreadTimeline } from './useThreadTimeline';
export type { UseVirtualizedTimelineOptions, UseVirtualizedTimelineResult } from './useVirtualizedTimeline';
export { useVirtualizedTimeline } from './useVirtualizedTimeline';
export { getMessageParts } from '@/lib/utils/message-status';
