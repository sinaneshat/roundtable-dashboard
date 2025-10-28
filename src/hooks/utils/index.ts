/**
 * Utility Hooks - General Purpose
 *
 * These hooks are reusable utilities not specific to any store.
 * Store-specific action hooks have been moved to @/stores/{feature}/actions/
 *
 * Zustand v5 Pattern: Co-locate store actions with stores, keep utilities here
 */

export { useBoolean } from './use-boolean';
export { useDebouncedValue } from './use-debounced-value';
export { useFuzzySearch } from './use-fuzzy-search';
export { useIsMobile } from './use-mobile';
export type { UseMessagePartsOptions, UseMessagePartsReturn } from './use-message-parts';
export { useMessageParts } from './use-message-parts';
export type { UseModelLookupReturn } from './use-model-lookup';
export { useModelLookup } from './use-model-lookup';
export { useMultiParticipantChat } from './use-multi-participant-chat';
export { useSelectedParticipants } from './use-selected-participants';
export { useSyncedMessageRefs } from './use-synced-message-refs';
export { toast, useToast } from './use-toast';
export { useChatScroll } from './useChatScroll';
export { useStreamingLoaderState } from './useStreamingLoaderState';
export type { TimelineItem, UseThreadTimelineOptions } from './useThreadTimeline';
export { useThreadTimeline } from './useThreadTimeline';
