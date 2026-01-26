/**
 * Roundtable Chat Store - Frame-Based Flow
 *
 * Follows the documented flow exactly (see docs/FLOW_DOCUMENTATION.md):
 *
 * ROUND 1 (Frames 1-6):
 *   Frame 1: User types message on Overview Screen
 *   Frame 2: Send clicked → ALL placeholders appear instantly
 *   Frame 3: Participant 1 starts streaming (others waiting)
 *   Frame 4: P1 complete → P2 starts (baton passed)
 *   Frame 5: All participants complete → Moderator starts
 *   Frame 6: Round 1 complete
 *
 * ROUND 2 (Frames 7-12):
 *   Frame 7: User enables web search + changes participants
 *   Frame 8: Send clicked → Changelog + all placeholders appear
 *   Frame 9: Changelog expanded (click to see details)
 *   Frame 10: Web Research streaming (blocks participants)
 *   Frame 11: Web Research complete → Participants start
 *   Frame 12: Round 2 complete
 *
 * Simple phase machine: idle → participants → moderator → complete → idle
 */

import { MessagePartTypes, MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX, ScreenModes, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { enableMapSet } from 'immer';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createStore } from 'zustand/vanilla';

import type { PendingAttachment } from '@/hooks/utils/attachment-schemas';
import type { FilePreview } from '@/hooks/utils/use-file-preview';
import type { UploadItem } from '@/hooks/utils/use-file-upload';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import { rlog } from '@/lib/utils/dev-logger';
import type { ApiChangelog, ChatParticipant, ChatThread, StoredPreSearch } from '@/services/api';

import {
  FORM_DEFAULTS,
  OVERVIEW_RESET,
  STORE_DEFAULTS,
  STREAMING_COMPLETE_RESET,
  SUBSCRIPTION_DEFAULTS,
  THREAD_NAVIGATION_RESET,
} from './store-defaults';
import type { ChatPhase, ChatStore, EntityStatus, TitleAnimationPhase } from './store-schemas';
import { ChatPhases } from './store-schemas';

enableMapSet();

export type ChatStoreApi = ReturnType<typeof createChatStore>;

/**
 * Create chat store with frame-based flow tracking
 */
export function createChatStore() {
  return createStore<ChatStore>()(
    devtools(
      immer((set, get) => ({
        ...STORE_DEFAULTS,

        // ============================================================
        // PHASE TRANSITIONS - Core Flow Machine
        // ============================================================

        addAttachments: (attachments: PendingAttachment[]) => {
          set((draft) => {
            (draft.pendingAttachments as PendingAttachment[]).push(...attachments);
          }, false, 'attachments/addAttachments');
        },

        /**
         * ADD CHANGELOG - Frame 8/9
         * "Changelog + All Placeholders Appear" / "Changelog Expanded"
         */
        addChangelogItems: (items: ApiChangelog[]) => {
          const existing = get().changelogItems;
          const ids = new Set(existing.map(i => i.id));
          const newItems = items.filter(i => !ids.has(i.id));
          if (newItems.length > 0) {
            rlog.frame(9, 'changelog-added', `${newItems.length} config changes detected`);
            rlog.changelog('add', `${newItems.length} items`);
            set({ changelogItems: [...existing, ...newItems] }, false, 'changelog/addChangelogItems');
          }
        },

        addParticipant: (participant: ParticipantConfig) => {
          set((draft) => {
            if (!draft.selectedParticipants.some(p => p.modelId === participant.modelId)) {
              draft.selectedParticipants.push({ ...participant, priority: draft.selectedParticipants.length });
            }
          }, false, 'form/addParticipant');
        },

        /**
         * ADD PRE-SEARCH - Frame 10
         * "Web Research Streaming (Blocks Participants)"
         */
        addPreSearch: (preSearch: StoredPreSearch) => {
          rlog.frame(10, 'pre-search-start', `r${preSearch.roundNumber} - Web Research blocks all participants`);
          set((draft) => {
            const existing = draft.preSearches.findIndex(
              ps => ps.threadId === preSearch.threadId && ps.roundNumber === preSearch.roundNumber,
            );
            if (existing === -1) {
              draft.preSearches.push(preSearch);
            }
          }, false, 'preSearch/addPreSearch');
        },

        // ============================================================
        // MESSAGES
        // ============================================================

        batchUpdatePendingState: (pendingMessage, expectedParticipantIds) => {
          set({ expectedParticipantIds, pendingMessage }, false, 'thread/batchUpdatePendingState');
        },

        // ============================================================
        // THREAD STATE
        // ============================================================

        chatStop: null,
        clearAllPreSearches: () => set({ preSearches: [] }, false, 'preSearch/clearAllPreSearches'),
        clearAllPreSearchTracking: () => {
          set({
            preSearchActivityTimes: new Map<number, number>(),
            triggeredPreSearchRounds: new Set<number>(),
          }, false, 'preSearch/clearAllPreSearchTracking');
        },
        clearAttachments: () => set({ pendingAttachments: [] }, false, 'attachments/clearAttachments'),
        clearModeratorTracking: () => {
          set({
            triggeredModeratorIds: new Set<string>(),
            triggeredModeratorRounds: new Set<number>(),
          }, false, 'tracking/clearModeratorTracking');
        },
        clearPreSearchActivity: (roundNumber: number) => {
          set((draft) => {
            draft.preSearchActivityTimes.delete(roundNumber);
          }, false, 'preSearch/clearPreSearchActivity');
        },
        clearPreSearchTracking: (roundNumber: number) => {
          set((draft) => {
            draft.triggeredPreSearchRounds.delete(roundNumber);
            draft.preSearchActivityTimes.delete(roundNumber);
          }, false, 'preSearch/clearPreSearchTracking');
        },
        /**
         * Clear all subscription state (on thread navigation or round end)
         */
        clearSubscriptionState: () => {
          set({ subscriptionState: SUBSCRIPTION_DEFAULTS }, false, 'subscription/clear');
        },
        completeRegeneration: () => {
          set({
            isRegenerating: false,
            regeneratingRoundNumber: null,
          }, false, 'operations/completeRegeneration');
        },
        completeStreaming: () => {
          const state = get();
          const roundNumber = state.currentRoundNumber ?? 0;

          // ✅ GUARD: Prevent duplicate completion - skip if already COMPLETE
          if (state.phase === ChatPhases.COMPLETE) {
            rlog.stream('check', `completeStreaming SKIP - already COMPLETE r${roundNumber}`);
            return;
          }

          rlog.stream('end', `completeStreaming r${roundNumber} phase=${state.phase}`);

          // NOTE: We intentionally do NOT clean up streaming placeholders here.
          // The setMessages call in useModeratorStream (both 200 and 204 paths) will
          // replace ALL messages with server data, which naturally removes placeholders.
          // Cleaning up here would cause a flash where placeholder text disappears
          // then reappears when server messages arrive.
          const cleanedMessages = state.messages;

          if (state.phase === ChatPhases.MODERATOR) {
            // ✅ FRAME 6/12: Log round completion when transitioning from MODERATOR
            const isRound1 = roundNumber === 0;
            if (isRound1) {
              rlog.frame(6, 'round-complete', `r${roundNumber} - Input re-enabled, ready for Round 2`);
            } else {
              rlog.frame(12, 'round-complete', `r${roundNumber} - Input re-enabled, ready for next round`);
            }

            rlog.phase('completeStreaming', `MODERATOR→COMPLETE r${roundNumber}`);
            rlog.moderator('complete', `r${roundNumber} - Round fully complete`);

            set({
              ...STREAMING_COMPLETE_RESET,
              messages: cleanedMessages,
              phase: ChatPhases.COMPLETE as ChatPhase,
            }, false, 'operations/completeStreaming');
          } else {
            set({
              ...STREAMING_COMPLETE_RESET,
              messages: cleanedMessages,
            }, false, 'operations/completeStreaming');
          }
        },
        completeTitleAnimation: () => {
          set({
            animatingThreadId: null,
            animationPhase: 'idle' as TitleAnimationPhase,
            displayedTitle: null,
            newTitle: null,
            oldTitle: null,
          }, false, 'titleAnimation/complete');
        },

        getAttachments: () => get().pendingAttachments,

        // ============================================================
        // FORM STATE
        // ============================================================

        hasAttachments: () => get().pendingAttachments.length > 0,
        hasModeratorStreamBeenTriggered: (moderatorId: string, roundNumber: number) => {
          const state = get();
          return state.triggeredModeratorIds.has(moderatorId) || state.triggeredModeratorRounds.has(roundNumber);
        },
        hasPreSearchBeenTriggered: (roundNumber: number) => get().triggeredPreSearchRounds.has(roundNumber),
        /**
         * Initialize subscriptions for a new round
         * Creates participant subscription state slots for each participant
         */
        initializeSubscriptions: (roundNumber: number, participantCount: number) => {
          rlog.stream('start', `initializeSubscriptions r${roundNumber} pCount=${participantCount}`);
          set((draft) => {
            draft.subscriptionState = {
              activeRoundNumber: roundNumber,
              moderator: { errorMessage: undefined, lastSeq: 0, status: 'idle' as EntityStatus },
              participants: Array.from({ length: participantCount }, () => ({
                errorMessage: undefined,
                lastSeq: 0,
                status: 'idle' as EntityStatus,
              })),
              presearch: { errorMessage: undefined, lastSeq: 0, status: 'idle' as EntityStatus },
            };
          }, false, 'subscription/initialize');
        },
        /**
         * INITIALIZE THREAD
         * Sets up thread state, preserving streaming state if active
         */
        initializeThread: (thread: ChatThread, participants: ChatParticipant[], messages: UIMessage[]) => {
          const currentState = get();

          // Preserve phase if streaming is pending or active
          const isStreamingPending = currentState.waitingToStartStreaming;
          const isStreamingActive = currentState.isStreaming
            || currentState.phase === ChatPhases.PARTICIPANTS
            || currentState.phase === ChatPhases.MODERATOR;
          const preservePhase = isStreamingPending || isStreamingActive;

          const newPhase = isStreamingActive
            ? currentState.phase
            : isStreamingPending
              ? ChatPhases.IDLE
              : (messages.length > 0 ? ChatPhases.COMPLETE : ChatPhases.IDLE);

          rlog.init('initializeThread', `tid=${thread.id.slice(-8)} msgs=${messages.length} phase=${currentState.phase}→${newPhase} preserve=${preservePhase}`);

          set({
            changelogItems: [],
            feedbackByRound: new Map(),
            hasInitiallyLoaded: true,
            hasLoadedFeedback: false,
            hasSentPendingMessage: false,
            messages,
            participants,
            phase: newPhase as ChatPhase,
            preSearchActivityTimes: new Map<number, number>(),
            preSearches: [],
            screenMode: ScreenModes.THREAD,
            showInitialUI: false,
            thread,
            triggeredModeratorIds: new Set<string>(),
            triggeredModeratorRounds: new Set<number>(),
            triggeredPreSearchRounds: new Set<number>(),
          }, false, 'operations/initializeThread');
        },
        loadFeedbackFromServer: (data) => {
          set({
            feedbackByRound: new Map(data.map(f => [f.roundNumber, f.feedbackType])),
            hasLoadedFeedback: true,
          }, false, 'feedback/loadFeedbackFromServer');
        },
        markModeratorStreamTriggered: (moderatorId: string, roundNumber: number) => {
          rlog.moderator('triggered', `r${roundNumber} id=${moderatorId.slice(-8)}`);
          set((draft) => {
            draft.triggeredModeratorIds.add(moderatorId);
            draft.triggeredModeratorRounds.add(roundNumber);
          }, false, 'tracking/markModeratorStreamTriggered');
        },
        markPreSearchTriggered: (roundNumber: number) => {
          rlog.presearch('triggered', `r${roundNumber}`);
          set((draft) => {
            draft.triggeredPreSearchRounds.add(roundNumber);
          }, false, 'preSearch/markPreSearchTriggered');
        },

        /**
         * MODERATOR COMPLETE - Frame 6/12
         * Called when moderator finishes streaming
         *
         * Frame 6: "Round 1 Complete"
         * Frame 12: "Round 2 Complete"
         */
        onModeratorComplete: () => {
          const state = get();
          const roundNumber = state.currentRoundNumber ?? 0;
          const isRound1 = roundNumber === 0;

          if (isRound1) {
            rlog.frame(6, 'round-complete', `r${roundNumber} - Input re-enabled, ready for Round 2`);
          } else {
            rlog.frame(12, 'round-complete', `r${roundNumber} - Input re-enabled, ready for next round`);
          }

          rlog.phase('onModeratorComplete', `MODERATOR→COMPLETE r${roundNumber}`);
          rlog.moderator('complete', `r${roundNumber} - Round fully complete`);

          set({
            isModeratorStreaming: false,
            isStreaming: false,
            phase: ChatPhases.COMPLETE as ChatPhase,
          }, false, 'phase/complete');
        },

        /**
         * PARTICIPANT COMPLETE - Frame 3/4/5 or 10/11
         * Called when a participant finishes streaming
         *
         * Frame 3: "Participant 1 Starts Streaming (Others Still Waiting)"
         * Frame 4: "Participant 1 Complete → Participant 2 Starts" (baton pass)
         * Frame 5: "All Participants Complete → Moderator Starts"
         * Frame 11: "Web Research Complete → Participants Start"
         */
        onParticipantComplete: (participantIndex: number) => {
          const state = get();
          const enabledCount = state.participants.filter(p => p.isEnabled).length;
          const roundNumber = state.currentRoundNumber ?? 0;
          const isRound1 = roundNumber === 0;

          // ✅ FIX: Check actual subscription state, not just index
          // This correctly handles out-of-order completion (e.g., P1 finishes before P0)
          const subState = state.subscriptionState;
          const allParticipantsComplete = subState.participants.length > 0
            && subState.participants.every(p => p.status === 'complete' || p.status === 'error');

          if (allParticipantsComplete) {
            // Frame 5 (R1) / Frame 11→moderator transition (R2)
            // "All Participants Complete → Moderator Starts"
            if (isRound1) {
              rlog.frame(5, 'all-participants-complete', `All ${enabledCount} participants complete → Moderator will start`);
            } else {
              rlog.frame(11, 'all-participants-complete', `All ${enabledCount} participants complete → Moderator will start`);
            }

            rlog.phase('onParticipantComplete', `PARTICIPANTS→MODERATOR r${roundNumber} (all ${enabledCount} done)`);
            rlog.handoff('baton-to-moderator', `All participants → Moderator`);

            set({
              currentParticipantIndex: enabledCount - 1, // Set to last participant index
              phase: ChatPhases.MODERATOR as ChatPhase,
            }, false, 'phase/toModerator');
          } else {
            // Not all participants complete yet - this callback may have been called for
            // an individual participant completion, log it but don't transition
            rlog.phase('onParticipantComplete', `P${participantIndex} complete, waiting for others (${subState.participants.filter(p => p.status === 'complete' || p.status === 'error').length}/${enabledCount})`);
          }
        },

        prepareForNewMessage: () => {
          set({
            hasSentPendingMessage: false,
            pendingMessage: null,
            phase: ChatPhases.IDLE as ChatPhase,
          }, false, 'operations/prepareForNewMessage');
        },

        removeAttachment: (id: string) => {
          set((draft) => {
            const idx = draft.pendingAttachments.findIndex(a => a.id === id);
            if (idx !== -1) {
              draft.pendingAttachments.splice(idx, 1);
            }
          }, false, 'attachments/removeAttachment');
        },

        // ============================================================
        // UI STATE
        // ============================================================

        removeParticipant: (participantId: string) => {
          set((draft) => {
            const idx = draft.selectedParticipants.findIndex(p => p.id === participantId || p.modelId === participantId);
            if (idx !== -1) {
              draft.selectedParticipants.splice(idx, 1);
              draft.selectedParticipants.forEach((p, i) => {
                p.priority = i;
              });
            }
          }, false, 'form/removeParticipant');
        },
        reorderParticipants: (fromIndex: number, toIndex: number) => {
          set((draft) => {
            const [removed] = draft.selectedParticipants.splice(fromIndex, 1);
            if (removed) {
              draft.selectedParticipants.splice(toIndex, 0, removed);
              draft.selectedParticipants.forEach((p, i) => {
                p.priority = i;
              });
            }
          }, false, 'form/reorderParticipants');
        },
        resetForm: () => set(FORM_DEFAULTS, false, 'form/resetForm'),
        resetForThreadNavigation: () => {
          rlog.init('resetForThreadNavigation', 'Clearing for new thread');
          set({
            ...THREAD_NAVIGATION_RESET,
            feedbackByRound: new Map(),
            preSearchActivityTimes: new Map<number, number>(),
            triggeredModeratorIds: new Set<string>(),
            triggeredModeratorRounds: new Set<number>(),
            triggeredPreSearchRounds: new Set<number>(),
          }, false, 'operations/resetForThreadNavigation');
        },
        resetToIdle: () => {
          rlog.phase('resetToIdle', '→IDLE');
          set({ phase: ChatPhases.IDLE as ChatPhase }, false, 'phase/toIdle');
        },
        resetToNewChat: () => {
          rlog.init('resetToNewChat', 'Starting new chat');
          set({
            ...OVERVIEW_RESET,
            feedbackByRound: new Map(),
            preSearchActivityTimes: new Map<number, number>(),
            triggeredModeratorIds: new Set<string>(),
            triggeredModeratorRounds: new Set<number>(),
            triggeredPreSearchRounds: new Set<number>(),
          }, false, 'operations/resetToNewChat');
        },
        resetToOverview: () => {
          rlog.init('resetToOverview', 'Returning to overview');
          set({
            ...OVERVIEW_RESET,
            feedbackByRound: new Map(),
            preSearchActivityTimes: new Map<number, number>(),
            triggeredModeratorIds: new Set<string>(),
            triggeredModeratorRounds: new Set<number>(),
            triggeredPreSearchRounds: new Set<number>(),
          }, false, 'operations/resetToOverview');
        },
        setAnimationPhase: phase => set({ animationPhase: phase }, false, 'titleAnimation/setAnimationPhase'),

        setAutoMode: enabled => set({ autoMode: enabled }, false, 'form/setAutoMode'),

        // ============================================================
        // FEEDBACK STATE
        // ============================================================

        setChangelogItems: items => set({ changelogItems: items }, false, 'changelog/setChangelogItems'),
        setChatStop: stop => set({ chatStop: stop }, false, 'external/setChatStop'),
        setCreatedThreadId: id => set({ createdThreadId: id }, false, 'ui/setCreatedThreadId'),

        // ============================================================
        // ATTACHMENTS STATE
        // ============================================================

        setCreatedThreadProjectId: projectId => set({ createdThreadProjectId: projectId }, false, 'ui/setCreatedThreadProjectId'),
        setCurrentParticipantIndex: index => set({ currentParticipantIndex: index }, false, 'thread/setCurrentParticipantIndex'),
        setCurrentRoundNumber: round => set({ currentRoundNumber: round }, false, 'thread/setCurrentRoundNumber'),
        setEnableWebSearch: enabled => set({ enableWebSearch: enabled }, false, 'form/setEnableWebSearch'),
        setError: error => set({ error }, false, 'thread/setError'),
        setExpectedParticipantIds: ids => set({ expectedParticipantIds: ids }, false, 'thread/setExpectedParticipantIds'),
        setFeedback: (roundNumber, type) => {
          set((draft) => {
            draft.feedbackByRound.set(roundNumber, type);
          }, false, 'feedback/setFeedback');
        },
        setHasInitiallyLoaded: loaded => set({ hasInitiallyLoaded: loaded }, false, 'ui/setHasInitiallyLoaded'),
        setHasSentPendingMessage: sent => set({ hasSentPendingMessage: sent }, false, 'thread/setHasSentPendingMessage'),

        // ============================================================
        // PRE-SEARCH STATE - Frame 10
        // ============================================================

        setInputValue: value => set({ inputValue: value }, false, 'form/setInputValue'),

        setIsAnalyzingPrompt: analyzing => set({ isAnalyzingPrompt: analyzing }, false, 'ui/setIsAnalyzingPrompt'),

        setIsCreatingThread: creating => set({ isCreatingThread: creating }, false, 'ui/setIsCreatingThread'),

        setIsModeratorStreaming: streaming => set({ isModeratorStreaming: streaming }, false, 'ui/setIsModeratorStreaming'),

        setIsRegenerating: regenerating => set({ isRegenerating: regenerating }, false, 'thread/setIsRegenerating'),

        setIsStreaming: streaming => set({ isStreaming: streaming }, false, 'thread/setIsStreaming'),
        setMessages: (messages) => {
          const prevMessages = get().messages;
          const newMessages = typeof messages === 'function' ? messages(prevMessages) : messages;
          if (prevMessages === newMessages) {
            return;
          }
          set({ messages: newMessages }, false, 'thread/setMessages');
        },
        setModelOrder: modelIds => set({ modelOrder: modelIds }, false, 'form/setModelOrder'),
        setParticipants: participants => set({ participants }, false, 'thread/setParticipants'),
        setPendingAttachmentIds: ids => set({ pendingAttachmentIds: ids }, false, 'attachments/setPendingAttachmentIds'),
        setPendingFeedback: feedback => set({ pendingFeedback: feedback }, false, 'feedback/setPendingFeedback'),
        setPendingFileParts: parts => set({ pendingFileParts: parts }, false, 'attachments/setPendingFileParts'),
        setPendingMessage: message => set({ pendingMessage: message }, false, 'form/setPendingMessage'),

        // ============================================================
        // CHANGELOG STATE - Frame 8/9
        // ============================================================

        setPreSearches: preSearches => set({ preSearches }, false, 'preSearch/setPreSearches'),

        setRegeneratingRoundNumber: round => set({ regeneratingRoundNumber: round }, false, 'thread/setRegeneratingRoundNumber'),

        // ============================================================
        // TITLE ANIMATION STATE
        // ============================================================

        setScreenMode: mode => set({ screenMode: mode }, false, 'ui/setScreenMode'),
        setSelectedMode: mode => set({ selectedMode: mode }, false, 'form/setSelectedMode'),
        setSelectedParticipants: participants => set({ selectedParticipants: participants }, false, 'form/setSelectedParticipants'),
        setShowInitialUI: show => set({ showInitialUI: show }, false, 'ui/setShowInitialUI'),

        // ============================================================
        // TRACKING STATE (deduplication)
        // ============================================================

        setStreamingRoundNumber: round => set({ streamingRoundNumber: round }, false, 'thread/setStreamingRoundNumber'),
        setThread: thread => set({ thread }, false, 'thread/setThread'),
        /**
         * WAITING TO START - Frame 1/7
         * User is typing, about to send
         */
        setWaitingToStartStreaming: (waiting) => {
          const state = get();
          if (waiting) {
            const isRound1 = state.currentRoundNumber === null || state.currentRoundNumber === 0;
            if (isRound1) {
              rlog.frame(1, 'waiting-to-start', 'User ready to send (Overview Screen)');
            } else {
              rlog.frame(7, 'waiting-to-start', 'User ready to send follow-up');
            }
          }
          set({ waitingToStartStreaming: waiting }, false, 'ui/setWaitingToStartStreaming');
        },

        // ============================================================
        // OPERATIONS
        // ============================================================

        startRegeneration: (roundNumber: number) => {
          rlog.stream('start', `Regenerating r${roundNumber}`);
          set({
            isRegenerating: true,
            isStreaming: true,
            regeneratingRoundNumber: roundNumber,
            streamingRoundNumber: roundNumber,
          }, false, 'operations/startRegeneration');
        },

        /**
         * START ROUND - Frame 2/8
         * Called when user sends message and placeholders should appear
         *
         * Frame 2 (R1): "User Clicks Send → ALL Placeholders Appear Instantly"
         * Frame 8 (R2): "Send Clicked → Changelog + All Placeholders Appear"
         */
        startRound: (roundNumber: number, participantCount: number) => {
          const isRound1 = roundNumber === 0;

          // Log the appropriate frame
          if (isRound1) {
            rlog.frame(2, 'startRound', `r${roundNumber} pCount=${participantCount} - ALL placeholders appear`);
          } else {
            rlog.frame(8, 'startRound', `r${roundNumber} pCount=${participantCount} - Changelog + placeholders appear`);
          }

          rlog.phase('startRound', `IDLE→PARTICIPANTS r${roundNumber} with ${participantCount} participants`);

          set({
            currentParticipantIndex: 0,
            currentRoundNumber: roundNumber,
            isStreaming: true,
            phase: ChatPhases.PARTICIPANTS as ChatPhase,
            waitingToStartStreaming: false,
          }, false, 'phase/startRound');
        },

        startTitleAnimation: (threadId: string, oldTitle: string | null, newTitle: string) => {
          set({
            animatingThreadId: threadId,
            animationPhase: 'deleting' as TitleAnimationPhase,
            displayedTitle: oldTitle,
            newTitle,
            oldTitle,
          }, false, 'titleAnimation/start');
        },

        subscriptionState: SUBSCRIPTION_DEFAULTS,

        tryMarkPreSearchTriggered: (roundNumber: number) => {
          const state = get();
          if (state.triggeredPreSearchRounds.has(roundNumber)) {
            return false;
          }
          set((draft) => {
            draft.triggeredPreSearchRounds.add(roundNumber);
          }, false, 'preSearch/tryMarkPreSearchTriggered');
          return true;
        },

        updateAttachmentPreview: (id: string, preview: FilePreview) => {
          set((draft) => {
            const attachment = draft.pendingAttachments.find(a => a.id === id);
            if (attachment) {
              attachment.preview = preview;
            }
          }, false, 'attachments/updateAttachmentPreview');
        },

        updateAttachmentUpload: (id: string, upload: UploadItem) => {
          set((draft) => {
            const attachment = draft.pendingAttachments.find(a => a.id === id);
            if (attachment) {
              (attachment as PendingAttachment).uploadItem = upload;
            }
          }, false, 'attachments/updateAttachmentUpload');
        },

        updateDisplayedTitle: (title: string) => set({ displayedTitle: title }, false, 'titleAnimation/updateDisplayedTitle'),

        /**
         * Update a specific entity's subscription status
         * @param entity - 'presearch', 'moderator', or participant index (number)
         */
        updateEntitySubscriptionStatus: (
          entity: 'presearch' | 'moderator' | number,
          status: EntityStatus,
          lastSeq?: number,
          errorMessage?: string,
        ) => {
          set((draft) => {
            const target = typeof entity === 'number'
              ? draft.subscriptionState.participants[entity]
              : draft.subscriptionState[entity];

            if (target) {
              target.status = status;
              if (lastSeq !== undefined) {
                target.lastSeq = lastSeq;
              }
              if (errorMessage !== undefined) {
                target.errorMessage = errorMessage;
              }
            }
          }, false, `subscription/update-${entity}`);
        },

        /**
         * Append streaming text to a participant's placeholder message.
         * Creates placeholder if not exists, appends text if exists.
         * Used for P1+ participants to show gradual streaming in UI.
         */
        appendEntityStreamingText: (participantIndex: number, text: string, roundNumber: number) => {
          if (!text) {
            return; // Skip empty text chunks
          }

          set((draft) => {
            // Generate streaming message ID - matches pattern used elsewhere
            const streamingMsgId = `streaming_p${participantIndex}_r${roundNumber}`;

            // Find existing streaming placeholder
            const existingIdx = draft.messages.findIndex(m => m.id === streamingMsgId);

            if (existingIdx >= 0) {
              // Append text to existing placeholder
              const msg = draft.messages[existingIdx];
              if (msg && msg.parts && msg.parts.length > 0) {
                const firstPart = msg.parts[0];
                if (firstPart && 'text' in firstPart && typeof firstPart.text === 'string') {
                  firstPart.text = firstPart.text + text;
                  rlog.stream('check', `P${participantIndex} r${roundNumber} APPEND +${text.length} chars → ${firstPart.text.length} total`);
                }
              }
            } else {
              // Create new streaming placeholder
              // Look up participant info from participants array
              const participant = draft.participants[participantIndex];
              const modelId = participant?.modelId ?? 'unknown';
              const participantId = participant?.id;

              const streamingMessage: UIMessage = {
                id: streamingMsgId,
                metadata: {
                  isStreaming: true,
                  model: modelId,
                  participantId,
                  participantIndex,
                  role: UIMessageRoles.ASSISTANT,
                  roundNumber,
                },
                parts: [{ text, type: MessagePartTypes.TEXT }],
                role: UIMessageRoles.ASSISTANT,
              };

              draft.messages.push(streamingMessage);
              rlog.stream('start', `P${participantIndex} r${roundNumber} streaming placeholder created`);
            }
          }, false, `streaming/appendText-p${participantIndex}`);
        },

        /**
         * Append streaming text to the moderator's placeholder message.
         * Creates placeholder if not exists, appends text if exists.
         * Used for gradual moderator streaming in UI.
         */
        appendModeratorStreamingText: (text: string, roundNumber: number) => {
          if (!text) {
            return; // Skip empty text chunks
          }

          set((draft) => {
            // FIX: Use the same ID format as useModeratorStream to avoid duplicate placeholders
            // useModeratorStream creates: ${threadId}_r${roundNumber}_moderator
            // Previously this used: streaming_moderator_r${roundNumber} which caused duplicates
            const threadId = draft.thread?.id;
            const streamingMsgId = threadId
              ? `${threadId}_r${roundNumber}_moderator`
              : `streaming_moderator_r${roundNumber}`; // Fallback if no thread yet

            // Find existing streaming placeholder
            const existingIdx = draft.messages.findIndex(m => m.id === streamingMsgId);

            if (existingIdx >= 0) {
              // Append text to existing placeholder
              const msg = draft.messages[existingIdx];
              if (msg && msg.parts && msg.parts.length > 0) {
                const firstPart = msg.parts[0];
                if (firstPart && 'text' in firstPart && typeof firstPart.text === 'string') {
                  firstPart.text = firstPart.text + text;
                  rlog.stream('check', `Moderator r${roundNumber} APPEND +${text.length} chars → ${firstPart.text.length} total`);
                }
              }
            } else {
              // Create new streaming placeholder for moderator
              const streamingMessage: UIMessage = {
                id: streamingMsgId,
                metadata: {
                  isStreaming: true,
                  model: 'moderator',
                  participantId: MODERATOR_NAME,
                  participantIndex: MODERATOR_PARTICIPANT_INDEX,
                  role: UIMessageRoles.ASSISTANT,
                  roundNumber,
                },
                parts: [{ text, type: MessagePartTypes.TEXT }],
                role: UIMessageRoles.ASSISTANT,
              };

              draft.messages.push(streamingMessage);
              rlog.stream('start', `Moderator r${roundNumber} streaming placeholder created`);
            }
          }, false, `streaming/appendText-moderator`);
        },

        // ============================================================
        // EXTERNAL CALLBACKS
        // ============================================================

        updatePartialPreSearchData: (roundNumber: number, partialData: unknown) => {
          set((draft) => {
            const ps = draft.preSearches.find(p => p.roundNumber === roundNumber);
            if (ps) {
              (ps as { searchData: unknown }).searchData = partialData;
            }
          }, false, 'preSearch/updatePartialPreSearchData');
        },
        updateParticipant: (participantId: string, updates: Partial<ParticipantConfig>) => {
          set((draft) => {
            const p = draft.selectedParticipants.find(p => p.id === participantId || p.modelId === participantId);
            if (p) {
              Object.assign(p, updates);
            }
          }, false, 'form/updateParticipant');
        },

        // ============================================================
        // SUBSCRIPTION STATE (Backend-First Architecture)
        // ============================================================

        updateParticipants: (participants: ChatParticipant[]) => {
          set({ participants }, false, 'operations/updateParticipants');
        },

        updatePreSearchActivity: (roundNumber: number) => {
          set((draft) => {
            draft.preSearchActivityTimes.set(roundNumber, Date.now());
          }, false, 'preSearch/updatePreSearchActivity');
        },

        /**
         * UPDATE PRE-SEARCH DATA - Frame 11 transition
         * "Web Research Complete → Participants Start"
         */
        updatePreSearchData: (roundNumber: number, searchData: unknown) => {
          rlog.frame(11, 'pre-search-complete', `r${roundNumber} - Web Research done, participants can start`);
          set((draft) => {
            const ps = draft.preSearches.find(p => p.roundNumber === roundNumber);
            if (ps) {
              (ps as { searchData: unknown }).searchData = searchData;
              ps.status = 'complete' as typeof ps.status;
              ps.completedAt = new Date().toISOString();
            }
          }, false, 'preSearch/updatePreSearchData');
        },

        updatePreSearchStatus: (roundNumber: number, status: string) => {
          set((draft) => {
            const ps = draft.preSearches.find(p => p.roundNumber === roundNumber);
            if (ps) {
              ps.status = status as typeof ps.status;
            }
          }, false, 'preSearch/updatePreSearchStatus');
        },
      })),
      { enabled: process.env.NODE_ENV === 'development', name: 'ChatStore' },
    ),
  );
}
