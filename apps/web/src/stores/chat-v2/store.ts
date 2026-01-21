/**
 * Simplified Chat Store - V2
 *
 * Consolidated from 15 slices to 4 domains with flow state machine.
 * No complex resumption logic - backend queue completes rounds.
 * Page refresh = reload from last completed state.
 *
 * ARCHITECTURE:
 * - FlowState machine for phase management (replaces 5+ booleans)
 * - Thread domain: conversation data
 * - Form domain: user input state
 * - PreSearch domain: web search results
 * - UI domain: minimal display state
 *
 * ZUSTAND V5 PATTERNS:
 * - Factory function (createChatStore) for SSR isolation
 * - createStore() from zustand/vanilla (NOT create())
 * - devtools middleware at combined level
 * - All set() calls include action name third parameter
 */

import { MessageStatuses } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { devtools } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';

import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';

import type { FlowContext, FlowEvent } from './flow-machine';
import { INITIAL_FLOW_STATE, transition } from './flow-machine';
import type {
  BackendThreadResponse,
  Changelog,
  ChatMode,
  ChatParticipant,
  ChatStore,
  ChatStoreState,
  ParticipantConfig,
  PreSearchResult,
  Thread,
  ThreadUser,
} from './store-schemas';

// ============================================================================
// DEFAULT STATE
// ============================================================================

const DEFAULT_STATE: ChatStoreState = {
  // Thread domain
  thread: null,
  participants: [],
  messages: [],
  changelog: [],
  threadUser: null,
  error: null,

  // Round domain
  flow: INITIAL_FLOW_STATE,
  createdThreadId: null,
  createdSlug: null,

  // Form domain
  inputValue: '',
  selectedMode: null,
  selectedParticipants: [],
  enableWebSearch: false,
  pendingMessage: null,
  screenMode: 'overview',

  // PreSearch domain
  preSearches: new Map(),

  // UI domain
  hasInitiallyLoaded: false,
  displayedTitle: null,
  targetTitle: null,
  isTitleAnimating: false,

  // Feedback
  feedbackByRound: new Map(),
};

// ============================================================================
// STORE FACTORY
// ============================================================================

/**
 * Create chat store instance (factory pattern for SSR)
 *
 * Each provider instance gets its own store for request isolation.
 * Uses vanilla createStore() with devtools middleware.
 */
export function createChatStore() {
  return createStore<ChatStore>()(
    devtools(
      (set, get) => ({
        // ========================================================================
        // INITIAL STATE
        // ========================================================================
        ...DEFAULT_STATE,

        // ========================================================================
        // THREAD ACTIONS
        // ========================================================================

        setThread: (thread: Thread | null) => {
          set({ thread }, false, 'thread/setThread');
        },

        setParticipants: (participants: ChatParticipant[]) => {
          set({ participants }, false, 'thread/setParticipants');
        },

        setMessages: (messages: UIMessage[]) => {
          set({ messages }, false, 'thread/setMessages');
        },

        addMessage: (message: UIMessage) => {
          const { messages } = get();
          // Avoid duplicates
          if (messages.some(m => m.id === message.id)) {
            return;
          }
          set({ messages: [...messages, message] }, false, 'thread/addMessage');
        },

        updateMessage: (id: string, update: Partial<UIMessage>) => {
          const { messages } = get();
          set({
            messages: messages.map(m =>
              m.id === id ? { ...m, ...update } : m,
            ),
          }, false, 'thread/updateMessage');
        },

        setError: (error: string | null) => {
          set({ error }, false, 'thread/setError');
        },

        initializeThread: (thread: Thread, participants: ChatParticipant[], messages: UIMessage[]) => {
          const state = get();
          const enabledCount = participants.filter(p => p.isEnabled).length;

          // Build flow context for transition
          const context: FlowContext = {
            enableWebSearch: thread.enableWebSearch,
            participantCount: enabledCount,
            hasPreSearchForRound: (round: number) => state.preSearches.has(round),
            isPreSearchComplete: (round: number) => {
              const ps = state.preSearches.get(round);
              return ps?.status === MessageStatuses.COMPLETE;
            },
          };

          // Transition flow to loaded state
          const newFlow = transition(
            INITIAL_FLOW_STATE,
            { type: 'LOAD_THREAD', thread, messages },
            context,
          );

          set({
            thread,
            participants,
            messages,
            flow: newFlow,
            error: null,
            hasInitiallyLoaded: true,
            screenMode: 'thread',
            // Sync form with thread config
            selectedMode: thread.mode,
            enableWebSearch: thread.enableWebSearch,
            selectedParticipants: participants
              .filter(p => p.isEnabled)
              .map(p => ({
                id: p.id,
                modelId: p.modelId,
                role: p.role,
                priority: p.priority,
                customRoleId: p.customRoleId,
                settings: p.settings ?? undefined,
              })),
          }, false, 'thread/initializeThread');
        },

        resetThread: () => {
          set({
            thread: null,
            participants: [],
            messages: [],
            changelog: [],
            threadUser: null,
            error: null,
            flow: INITIAL_FLOW_STATE,
            createdThreadId: null,
            createdSlug: null,
            hasInitiallyLoaded: false,
          }, false, 'thread/resetThread');
        },

        setChangelog: (changelog: Changelog[]) => {
          set({ changelog }, false, 'thread/setChangelog');
        },

        setThreadUser: (user: ThreadUser | null) => {
          set({ threadUser: user }, false, 'thread/setThreadUser');
        },

        /**
         * Sync store state from backend response - ensures store = DB truth
         *
         * This action reconciles the store with the canonical backend state.
         * Called after:
         * - Page load (route loader)
         * - Round complete (moderator done)
         * - Poll complete
         * - Error recovery
         *
         * Guarantees: store.relevantState === backendResponse
         */
        syncFromBackend: (response: BackendThreadResponse) => {
          const { thread, participants, messages, changelog, feedback, preSearches, user } = response;

          // Transform ChatMessage[] → UIMessage[]
          const uiMessages = chatMessagesToUIMessages(messages, participants);

          // Transform preSearches to Map (roundNumber → PreSearchResult)
          const preSearchMap = new Map<number, PreSearchResult>();
          if (preSearches) {
            for (const ps of preSearches) {
              preSearchMap.set(ps.roundNumber, {
                roundNumber: ps.roundNumber,
                status: ps.status,
                query: ps.userQuery,
                results: ps.searchData?.results?.flatMap((r: { results: Array<{ title: string; url: string; content?: string; excerpt?: string }> }) =>
                  r.results.map((item: { title: string; url: string; content?: string; excerpt?: string }) => ({
                    title: item.title,
                    url: item.url,
                    snippet: item.content || item.excerpt,
                  })),
                ) ?? null,
                startedAt: ps.createdAt ? new Date(ps.createdAt).getTime() : null,
                completedAt: ps.completedAt ? new Date(ps.completedAt).getTime() : null,
              });
            }
          }

          // Transform feedback to Map (roundNumber → feedbackType)
          // Backend uses 'like'/'dislike', store uses same values
          const feedbackMap = new Map<number, 'like' | 'dislike' | null>();
          if (feedback) {
            for (const f of feedback) {
              feedbackMap.set(f.roundNumber, f.feedbackType);
            }
          }

          // Determine flow state from messages
          const maxRound = getMaxRoundFromMessages(uiMessages);
          const isComplete = hasModeratorForRound(uiMessages, maxRound);

          set({
            // Thread domain
            thread,
            participants,
            messages: uiMessages,
            changelog,
            threadUser: user,
            error: null,

            // PreSearch domain
            preSearches: preSearchMap,

            // Feedback domain
            feedbackByRound: feedbackMap,

            // Flow state - set to round_complete at appropriate round
            flow: isComplete
              ? { type: 'round_complete', threadId: thread.id, round: maxRound }
              : { type: 'round_complete', threadId: thread.id, round: Math.max(0, maxRound - 1) },

            // UI state
            hasInitiallyLoaded: true,
            screenMode: 'thread',

            // Sync form with thread config
            selectedMode: thread.mode,
            enableWebSearch: thread.enableWebSearch,
            selectedParticipants: participants
              .filter(p => p.isEnabled)
              .map(p => ({
                id: p.id,
                modelId: p.modelId,
                role: p.role,
                priority: p.priority,
                customRoleId: p.customRoleId,
                settings: p.settings ?? undefined,
              })),
          }, false, 'sync/syncFromBackend');
        },

        // ========================================================================
        // ROUND/FLOW ACTIONS
        // ========================================================================

        dispatch: (event: FlowEvent) => {
          const state = get();
          const enabledCount = state.participants.filter(p => p.isEnabled).length
            || state.selectedParticipants.length;

          const context: FlowContext = {
            enableWebSearch: state.enableWebSearch,
            participantCount: enabledCount,
            hasPreSearchForRound: (round: number) => state.preSearches.has(round),
            isPreSearchComplete: (round: number) => {
              const ps = state.preSearches.get(round);
              return ps?.status === MessageStatuses.COMPLETE;
            },
          };

          const newFlow = transition(state.flow, event, context);

          // Handle side effects based on new state
          if (event.type === 'THREAD_CREATED') {
            set({
              flow: newFlow,
              createdThreadId: event.threadId,
              createdSlug: event.slug,
            }, false, 'round/dispatch:THREAD_CREATED');
          } else {
            set({ flow: newFlow }, false, `round/dispatch:${event.type}`);
          }
        },

        setCreatedThreadId: (id: string | null) => {
          set({ createdThreadId: id }, false, 'round/setCreatedThreadId');
        },

        setCreatedSlug: (slug: string | null) => {
          set({ createdSlug: slug }, false, 'round/setCreatedSlug');
        },

        // ========================================================================
        // FORM ACTIONS
        // ========================================================================

        setInputValue: (value: string) => {
          set({ inputValue: value }, false, 'form/setInputValue');
        },

        setSelectedMode: (mode: ChatMode | null) => {
          set({ selectedMode: mode }, false, 'form/setSelectedMode');
        },

        setSelectedParticipants: (participants: ParticipantConfig[]) => {
          set({ selectedParticipants: participants }, false, 'form/setSelectedParticipants');
        },

        addParticipant: (participant: ParticipantConfig) => {
          const { selectedParticipants } = get();
          if (selectedParticipants.some(p => p.modelId === participant.modelId)) {
            return;
          }
          set({
            selectedParticipants: [...selectedParticipants, participant],
          }, false, 'form/addParticipant');
        },

        removeParticipant: (modelId: string) => {
          const { selectedParticipants } = get();
          set({
            selectedParticipants: selectedParticipants.filter(p => p.modelId !== modelId),
          }, false, 'form/removeParticipant');
        },

        updateParticipant: (modelId: string, update: Partial<ParticipantConfig>) => {
          const { selectedParticipants } = get();
          set({
            selectedParticipants: selectedParticipants.map(p =>
              p.modelId === modelId ? { ...p, ...update } : p,
            ),
          }, false, 'form/updateParticipant');
        },

        setEnableWebSearch: (enabled: boolean) => {
          set({ enableWebSearch: enabled }, false, 'form/setEnableWebSearch');
        },

        setPendingMessage: (message: string | null) => {
          set({ pendingMessage: message }, false, 'form/setPendingMessage');
        },

        setScreenMode: (mode: 'overview' | 'thread' | 'public') => {
          set({ screenMode: mode }, false, 'form/setScreenMode');
        },

        resetForm: () => {
          set({
            inputValue: '',
            pendingMessage: null,
          }, false, 'form/resetForm');
        },

        // ========================================================================
        // PRE-SEARCH ACTIONS
        // ========================================================================

        setPreSearch: (roundNumber: number, result: PreSearchResult) => {
          const { preSearches } = get();
          const newMap = new Map(preSearches);
          newMap.set(roundNumber, result);
          set({ preSearches: newMap }, false, 'preSearch/setPreSearch');
        },

        updatePreSearchStatus: (roundNumber: number, status) => {
          const { preSearches } = get();
          const existing = preSearches.get(roundNumber);
          if (!existing)
            return;

          const newMap = new Map(preSearches);
          newMap.set(roundNumber, {
            ...existing,
            status,
            ...(status === MessageStatuses.COMPLETE && { completedAt: Date.now() }),
          });
          set({ preSearches: newMap }, false, 'preSearch/updatePreSearchStatus');
        },

        clearPreSearches: () => {
          set({ preSearches: new Map() }, false, 'preSearch/clearPreSearches');
        },

        getPreSearchForRound: (roundNumber: number) => {
          return get().preSearches.get(roundNumber);
        },

        isPreSearchComplete: (roundNumber: number) => {
          const ps = get().preSearches.get(roundNumber);
          return ps?.status === MessageStatuses.COMPLETE;
        },

        // ========================================================================
        // UI ACTIONS
        // ========================================================================

        setHasInitiallyLoaded: (loaded: boolean) => {
          set({ hasInitiallyLoaded: loaded }, false, 'ui/setHasInitiallyLoaded');
        },

        startTitleAnimation: (targetTitle: string) => {
          set({
            targetTitle,
            isTitleAnimating: true,
            displayedTitle: '',
          }, false, 'ui/startTitleAnimation');
        },

        updateDisplayedTitle: (title: string) => {
          set({ displayedTitle: title }, false, 'ui/updateDisplayedTitle');
        },

        completeTitleAnimation: () => {
          const { targetTitle } = get();
          set({
            displayedTitle: targetTitle,
            isTitleAnimating: false,
          }, false, 'ui/completeTitleAnimation');
        },

        // ========================================================================
        // FEEDBACK ACTIONS
        // ========================================================================

        setFeedback: (roundNumber, feedback) => {
          const { feedbackByRound } = get();
          const newMap = new Map(feedbackByRound);
          newMap.set(roundNumber, feedback);
          set({ feedbackByRound: newMap }, false, 'feedback/setFeedback');
        },

        getFeedback: (roundNumber) => {
          return get().feedbackByRound.get(roundNumber) ?? null;
        },
      }),
      {
        name: 'chat-store-v2',
        enabled: process.env.NODE_ENV === 'development',
      },
    ),
  );
}

// ============================================================================
// SYNC HELPER FUNCTIONS
// ============================================================================

/**
 * Get max round number from messages
 */
function getMaxRoundFromMessages(messages: UIMessage[]): number {
  let maxRound = 0;
  for (const msg of messages) {
    // Type-safe metadata extraction using utility function
    const metadata = msg.metadata;
    if (metadata && typeof metadata === 'object' && 'roundNumber' in metadata) {
      const roundNumber = metadata.roundNumber;
      if (typeof roundNumber === 'number') {
        maxRound = Math.max(maxRound, roundNumber);
      }
    }
  }
  return maxRound;
}

/**
 * Check if a round has a moderator message
 */
function hasModeratorForRound(messages: UIMessage[], round: number): boolean {
  return messages.some((msg) => {
    const metadata = msg.metadata;
    if (!metadata || typeof metadata !== 'object')
      return false;

    return (
      'roundNumber' in metadata
      && metadata.roundNumber === round
      && 'isModerator' in metadata
      && metadata.isModerator === true
    );
  });
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ChatStoreApi = ReturnType<typeof createChatStore>;
