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
import { isModeratorMetadataFast } from '@/lib/utils/metadata';
import {
  areAllParticipantsComplete,
  countEnabledParticipants,
  getModeratorStreamingId,
  getParticipantStreamingId,
  isStreamingMetadata,
  isTerminalStatus,
} from '@/lib/utils/streaming-helpers';
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
 * Initial state options for SSR hydration
 * These values are applied at store creation time to prevent flash
 */
export type ChatStoreInitialState = {
  messages?: UIMessage[];
  participants?: ChatParticipant[];
  thread?: ChatThread | null;
  preSearches?: StoredPreSearch[];
  changelogItems?: ApiChangelog[];
  hasInitiallyLoaded?: boolean;
};

/**
 * Create chat store with frame-based flow tracking
 *
 * @param initialState - Optional initial state for SSR hydration.
 *   When provided, the store is created with data already populated,
 *   preventing the flash that occurs when hydrating an empty store.
 */
export function createChatStore(initialState?: ChatStoreInitialState) {
  // Compute initial values from provided state
  const initialMessages = initialState?.messages ?? [];
  const initialParticipants = initialState?.participants ?? [];
  const initialThread = initialState?.thread ?? null;
  const initialPreSearches = initialState?.preSearches ?? [];
  const initialChangelogItems = initialState?.changelogItems ?? [];
  const initialHasLoaded = initialState?.hasInitiallyLoaded ?? false;

  // Determine initial phase based on messages
  const hasMessages = initialMessages.length > 0;
  const initialPhase = hasMessages ? ChatPhases.COMPLETE : ChatPhases.IDLE;

  return createStore<ChatStore>()(
    devtools(
      immer((set, get) => ({
        ...STORE_DEFAULTS,
        // Apply initial state overrides for SSR
        ...(initialState
          ? {
              changelogItems: initialChangelogItems,
              hasInitiallyLoaded: initialHasLoaded,
              messages: initialMessages,
              participants: initialParticipants,
              phase: initialPhase as ChatPhase,
              preSearches: initialPreSearches,
              screenMode: initialThread ? ScreenModes.THREAD : STORE_DEFAULTS.screenMode,
              showInitialUI: !initialThread,
              thread: initialThread,
            }
          : {}),

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

        /**
         * Append streaming text to a participant's placeholder message.
         * Creates placeholder if not exists, appends text if exists.
         * Used for P1+ participants to show gradual streaming in UI.
         */
        appendEntityStreamingText: (participantIndex: number, text: string, roundNumber: number) => {
          if (!text) {
            return; // Skip empty text chunks
          }

          // Validate participantIndex bounds BEFORE entering set()
          // This prevents creating messages with 'unknown' modelId for invalid indices
          const currentState = get();
          if (
            participantIndex < 0
            || !Number.isInteger(participantIndex)
            || participantIndex >= currentState.participants.length
          ) {
            rlog.stuck('streaming', `Invalid participantIndex ${participantIndex} (valid: 0-${currentState.participants.length - 1})`);
            return; // Silently ignore invalid indices
          }

          set((draft) => {
            // Generate streaming message ID using shared utility
            const streamingMsgId = getParticipantStreamingId(participantIndex, roundNumber);

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
              // Look up participant info from participants array (already validated above)
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
         * Mark a participant's streaming placeholder as complete (clear isStreaming flag).
         * Called when participant subscription completes to allow round completion to proceed.
         */
        finalizeParticipantStreaming: (participantIndex: number, roundNumber: number) => {
          set((draft) => {
            const streamingMsgId = getParticipantStreamingId(participantIndex, roundNumber);
            const msg = draft.messages.find(m => m.id === streamingMsgId);
            if (msg && msg.metadata && typeof msg.metadata === 'object') {
              (msg.metadata as Record<string, unknown>).isStreaming = false;
              rlog.stream('end', `P${participantIndex} r${roundNumber} streaming finalized`);
            }
          }, false, `streaming/finalize-p${participantIndex}`);
        },

        /**
         * Mark the moderator's streaming placeholder as complete (clear isStreaming flag).
         * Called when moderator subscription completes to allow round completion to proceed.
         */
        finalizeModeratorStreaming: (roundNumber: number) => {
          set((draft) => {
            const streamingMsgId = getModeratorStreamingId(draft.thread?.id ?? null, roundNumber);
            const msg = draft.messages.find(m => m.id === streamingMsgId);
            if (msg && msg.metadata && typeof msg.metadata === 'object') {
              (msg.metadata as Record<string, unknown>).isStreaming = false;
              rlog.stream('end', `Moderator r${roundNumber} streaming finalized`);
            }
          }, false, 'streaming/finalize-moderator');
        },

        // ============================================================
        // THREAD STATE
        // ============================================================

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
            // Generate moderator streaming ID using shared utility
            const streamingMsgId = getModeratorStreamingId(draft.thread?.id ?? null, roundNumber);

            // Primary lookup: by ID
            let existingIdx = draft.messages.findIndex(m => m.id === streamingMsgId);

            // FIX: Fallback lookup by metadata if ID lookup fails (handles ID mismatch)
            // This can happen if placeholder was created with fallback ID when threadId was null,
            // but now threadId is available so we're looking for a different ID
            if (existingIdx < 0) {
              existingIdx = draft.messages.findIndex((m) => {
                const meta = m.metadata;
                return isModeratorMetadataFast(meta)
                  && isStreamingMetadata(meta)
                  && meta && typeof meta === 'object'
                  && 'roundNumber' in meta && (meta as { roundNumber: number }).roundNumber === roundNumber;
              });

              if (existingIdx >= 0) {
                const foundMsg = draft.messages[existingIdx];
                if (foundMsg) {
                  rlog.moderator('append', `ID mismatch fixed: found by metadata at idx=${existingIdx}, updating ID`);
                  // Update the ID to match expected format for future appends
                  foundMsg.id = streamingMsgId;
                }
              }
            }

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
              // Create new streaming placeholder for moderator (shouldn't happen if placeholder exists)
              rlog.stuck('moderator', `No placeholder found for r${roundNumber}, creating new message id=${streamingMsgId}`);
              const streamingMessage: UIMessage = {
                id: streamingMsgId,
                metadata: {
                  isModerator: true,
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
        batchUpdatePendingState: (pendingMessage, expectedModelIds) => {
          set({ expectedModelIds, pendingMessage }, false, 'thread/batchUpdatePendingState');
        },
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
          // The subscription callbacks will replace ALL messages with server data,
          // which naturally removes placeholders. Cleaning up here would cause a
          // flash where placeholder text disappears then reappears.
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
              pendingMessage: null,
              phase: ChatPhases.COMPLETE as ChatPhase,
            }, false, 'operations/completeStreaming');
          } else {
            set({
              ...STREAMING_COMPLETE_RESET,
              messages: cleanedMessages,
            }, false, 'operations/completeStreaming');
          }
        },

        // ============================================================
        // FORM STATE
        // ============================================================

        completeTitleAnimation: () => {
          set({
            animatingThreadId: null,
            animationPhase: 'idle' as TitleAnimationPhase,
            displayedTitle: null,
            newTitle: null,
            oldTitle: null,
          }, false, 'titleAnimation/complete');
        },
        /**
         * CREATE STREAMING PLACEHOLDERS - Frame 2/8
         * Creates empty streaming placeholder messages for all participants (P1+) and moderator.
         * Called proactively when round starts so UI shows placeholders immediately,
         * rather than waiting for first streaming chunk to arrive.
         *
         * P0 is handled by AI SDK, so we only create placeholders for P1+.
         */
        createStreamingPlaceholders: (roundNumber: number, participantCount: number) => {
          set((draft) => {
            // Create placeholders for P1+ (P0 is handled by AI SDK)
            // IMPORTANT: Only create placeholders for participants that actually exist
            // This prevents creating messages with 'unknown' modelId
            const maxValidIndex = Math.min(participantCount, draft.participants.length);

            for (let i = 1; i < maxValidIndex; i++) {
              const streamingMsgId = getParticipantStreamingId(i, roundNumber);

              // Skip if already exists
              if (draft.messages.some(m => m.id === streamingMsgId)) {
                continue;
              }

              const participant = draft.participants[i];
              // Double-check participant exists (defensive)
              if (!participant) {
                rlog.stuck('placeholder', `Skipping P${i} - participant not found`);
                continue;
              }

              const modelId = participant.modelId;
              const participantId = participant.id;

              const placeholder: UIMessage = {
                id: streamingMsgId,
                metadata: {
                  isStreaming: true,
                  model: modelId,
                  participantId,
                  participantIndex: i,
                  role: UIMessageRoles.ASSISTANT,
                  roundNumber,
                },
                parts: [{ text: '', type: MessagePartTypes.TEXT }], // Empty text initially
                role: UIMessageRoles.ASSISTANT,
              };

              draft.messages.push(placeholder);
              rlog.stream('check', `P${i} r${roundNumber} proactive placeholder created (empty)`);
            }

            // Create moderator placeholder using shared utility
            const threadId = draft.thread?.id ?? null;
            const modId = getModeratorStreamingId(threadId, roundNumber);

            // Log if threadId is missing - this could cause ID mismatch with appendModeratorStreamingText
            if (!threadId) {
              rlog.stuck('placeholder', `createStreamingPlaceholders: threadId missing for moderator r${roundNumber}, using fallback ID`);
            }
            rlog.moderator('placeholder', `creating moderator placeholder id=${modId} threadId=${threadId || 'null'}`);

            if (!draft.messages.some(m => m.id === modId)) {
              draft.messages.push({
                id: modId,
                metadata: {
                  isModerator: true,
                  isStreaming: true,
                  model: MODERATOR_NAME,
                  participantIndex: MODERATOR_PARTICIPANT_INDEX,
                  role: UIMessageRoles.ASSISTANT,
                  roundNumber,
                },
                parts: [{ text: '', type: MessagePartTypes.TEXT }],
                role: UIMessageRoles.ASSISTANT,
              });
              rlog.stream('check', `Moderator r${roundNumber} proactive placeholder created (empty)`);
            }
          }, false, 'streaming/createPlaceholders');
        },
        getAttachments: () => get().pendingAttachments,
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
          const currentState = get();
          const currentSub = currentState.subscriptionState;

          // ✅ FIX: Don't reset subscriptions if already initialized for this round
          // Race condition: useRoundSubscription hook starts subscriptions BEFORE this effect runs
          // If we reset to 'idle' after subscription already set 'waiting', the flow breaks
          if (currentSub.activeRoundNumber === roundNumber) {
            // Check if any subscription is already active (not 'idle')
            const presearchActive = currentSub.presearch.status !== 'idle';
            const participantActive = currentSub.participants.some(p => p.status !== 'idle');
            const moderatorActive = currentSub.moderator.status !== 'idle';

            if (presearchActive || participantActive || moderatorActive) {
              rlog.stream('check', `initializeSubscriptions r${roundNumber} SKIP - already active (presearch=${currentSub.presearch.status})`);
              return;
            }
          }

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

          // ✅ FIX: Don't assume COMPLETE when messages exist
          // Previously: messages.length > 0 → COMPLETE (WRONG when mid-round refresh)
          // Now: Always start with IDLE, let resumption detection set correct phase
          //
          // If streaming is active, preserve current phase (handles React re-renders)
          // If streaming is pending, use IDLE (user is about to send)
          // Otherwise, use IDLE and let useStreamResumption check backend state
          //
          // This fixes the bug where refreshing mid-round showed only user message
          // because phase was incorrectly set to COMPLETE, preventing subscriptions.
          const newPhase = isStreamingActive
            ? currentState.phase
            : ChatPhases.IDLE;

          rlog.init('initializeThread', `tid=${thread.id.slice(-8)} msgs=${messages.length} phase=${currentState.phase}→${newPhase} preserve=${preservePhase} (resumption will check backend)`);

          set({
            changelogItems: [],
            hasInitiallyLoaded: true,
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
            pendingMessage: null,
            phase: ChatPhases.COMPLETE as ChatPhase,
          }, false, 'phase/complete');
        },

        // ============================================================
        // UI STATE
        // ============================================================

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
          // ✅ FIX: Use captured activeRoundParticipantCount instead of computing from state.participants
          // state.participants may be stale due to React batched updates, but activeRoundParticipantCount
          // was captured at round start and is the source of truth for the current streaming round
          const enabledCount = state.activeRoundParticipantCount;
          const stateEnabledCount = countEnabledParticipants(state.participants);
          const roundNumber = state.currentRoundNumber ?? 0;
          const isRound1 = roundNumber === 0;

          // ✅ DIAGNOSTIC: Log if activeRoundParticipantCount diverges from state.participants
          if (enabledCount !== stateEnabledCount) {
            rlog.trigger('onParticipantComplete-divergence', `r${roundNumber} activeCount=${enabledCount} stateCount=${stateEnabledCount}`);
          }

          // ✅ FIX: Check actual subscription state, not just index
          // This correctly handles out-of-order completion (e.g., P1 finishes before P0)
          const subState = state.subscriptionState;
          const allComplete = areAllParticipantsComplete(subState.participants);

          if (allComplete) {
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
            const completedCount = subState.participants.filter(p => p.status === 'complete' || p.status === 'error').length;
            rlog.phase('onParticipantComplete', `P${participantIndex} complete, waiting for others (${completedCount}/${enabledCount})`);
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
            preSearchActivityTimes: new Map<number, number>(),
            triggeredModeratorIds: new Set<string>(),
            triggeredModeratorRounds: new Set<number>(),
            triggeredPreSearchRounds: new Set<number>(),
          }, false, 'operations/resetToOverview');
        },

        /**
         * RESUME IN-PROGRESS ROUND - Stream Resumption Fix
         *
         * Called when useStreamResumption detects an active round in backend KV state
         * after page refresh. This bridges the gap between backend state and frontend store.
         *
         * Per FLOW_DOCUMENTATION.md: Backend is source of truth for round execution.
         * Frontend subscribes and displays.
         *
         * Flow:
         * 1. User refreshes mid-round
         * 2. useStreamResumption fetches backend state (phase=PARTICIPANTS)
         * 3. This action sets correct phase, creates placeholders, enables subscriptions
         * 4. useRoundSubscription picks up streams from KV
         */
        resumeInProgressRound: ({
          currentParticipantIndex,
          phase,
          roundNumber,
          totalParticipants,
        }: {
          roundNumber: number;
          phase: 'presearch' | 'participants' | 'moderator';
          totalParticipants: number;
          currentParticipantIndex: number | null;
        }) => {
          const state = get();

          // ✅ GUARD: Set resuming flag to prevent race with user actions
          // This prevents startRound from being called while we're setting up resumption
          set({ isResumingStream: true }, false, 'resume/setGuard');

          // ✅ FIX: Trust backend's totalParticipants over potentially stale frontend state
          // Backend KV is the source of truth during resumption - it knows how many participants
          // were in the round when it started. Frontend state may be stale or incorrect.
          const frontendEnabledCount = countEnabledParticipants(state.participants);

          // ✅ DIAGNOSTIC: Log divergence but trust backend count
          if (totalParticipants !== frontendEnabledCount) {
            rlog.trigger('resume-divergence', `r${roundNumber} backend=${totalParticipants} frontendEnabled=${frontendEnabledCount} frontendTotal=${state.participants.length} - trusting backend`);
          }

          // Use backend count as the authoritative source, with sanity check
          const MAX_REASONABLE_PARTICIPANTS = 10;
          const actualCount = totalParticipants > 0 && totalParticipants <= MAX_REASONABLE_PARTICIPANTS
            ? totalParticipants
            : frontendEnabledCount > 0 ? frontendEnabledCount : 1; // Fallback chain

          rlog.resume('start', `resumeInProgressRound r${roundNumber} phase=${phase} backendTotal=${totalParticipants} actualCount=${actualCount} curIdx=${currentParticipantIndex}`);

          // Map backend phase to frontend ChatPhases
          const frontendPhase = phase === 'presearch'
            ? ChatPhases.PARTICIPANTS // Frontend doesn't have presearch phase, use participants
            : phase === 'participants'
              ? ChatPhases.PARTICIPANTS
              : ChatPhases.MODERATOR;

          rlog.phase('resume', `IDLE→${frontendPhase} (backend phase=${phase})`);

          // Create streaming placeholders for all entities (like startRound does)
          // This ensures UI shows placeholders before streaming content arrives
          rlog.resume('placeholders', `creating ${actualCount} participant + moderator placeholders`);
          get().createStreamingPlaceholders(roundNumber, actualCount);

          // Initialize subscription state so useRoundSubscription can pick up streams
          rlog.resume('subscriptions', `initializing subscriptions for r${roundNumber} with ${actualCount} participants`);
          get().initializeSubscriptions(roundNumber, actualCount);

          // Set store state to match backend
          // ✅ GUARD: Clear resuming flag now that setup is complete
          set({
            activeRoundParticipantCount: actualCount,
            currentParticipantIndex: currentParticipantIndex ?? 0,
            currentRoundNumber: roundNumber,
            isResumingStream: false, // Clear guard - resumption setup complete
            isStreaming: true,
            phase: frontendPhase as ChatPhase,
            waitingToStartStreaming: false,
          }, false, 'operations/resumeInProgressRound');

          rlog.resume('complete', `r${roundNumber} resumed - subscriptions should now connect`);
        },

        setAnimationPhase: phase => set({ animationPhase: phase }, false, 'titleAnimation/setAnimationPhase'),
        setAutoMode: enabled => set({ autoMode: enabled }, false, 'form/setAutoMode'),

        // ============================================================
        // ATTACHMENTS STATE
        // ============================================================

        setChangelogItems: items => set({ changelogItems: items }, false, 'changelog/setChangelogItems'),
        setChatStop: stop => set({ chatStop: stop }, false, 'external/setChatStop'),
        setCreatedThreadId: id => set({ createdThreadId: id }, false, 'ui/setCreatedThreadId'),
        setCreatedThreadProjectId: projectId => set({ createdThreadProjectId: projectId }, false, 'ui/setCreatedThreadProjectId'),
        setCurrentParticipantIndex: index => set({ currentParticipantIndex: index }, false, 'thread/setCurrentParticipantIndex'),
        setCurrentRoundNumber: round => set({ currentRoundNumber: round }, false, 'thread/setCurrentRoundNumber'),
        setEnableWebSearch: enabled => set({ enableWebSearch: enabled }, false, 'form/setEnableWebSearch'),
        setError: error => set({ error }, false, 'thread/setError'),
        setExpectedModelIds: ids => set({ expectedModelIds: ids }, false, 'thread/setExpectedModelIds'),

        // ============================================================
        // PRE-SEARCH STATE - Frame 10
        // ============================================================

        setHasInitiallyLoaded: loaded => set({ hasInitiallyLoaded: loaded }, false, 'ui/setHasInitiallyLoaded'),

        setHasSentPendingMessage: sent => set({ hasSentPendingMessage: sent }, false, 'thread/setHasSentPendingMessage'),

        setInputValue: value => set({ inputValue: value }, false, 'form/setInputValue'),

        setIsAnalyzingPrompt: analyzing => set({ isAnalyzingPrompt: analyzing }, false, 'ui/setIsAnalyzingPrompt'),

        setIsCreatingThread: creating => set({ isCreatingThread: creating }, false, 'ui/setIsCreatingThread'),
        setIsModeratorStreaming: streaming => set({ isModeratorStreaming: streaming }, false, 'ui/setIsModeratorStreaming'),
        setIsRegenerating: regenerating => set({ isRegenerating: regenerating }, false, 'thread/setIsRegenerating'),
        setIsResumingStream: resuming => set({ isResumingStream: resuming }, false, 'ui/setIsResumingStream'),
        setIsStreaming: streaming => set({ isStreaming: streaming }, false, 'thread/setIsStreaming'),
        setMessages: (messages) => {
          const prevMessages = get().messages;
          const newMessages = typeof messages === 'function' ? messages(prevMessages) : messages;
          if (prevMessages === newMessages) {
            return;
          }
          // DEBUG: Track when messages are replaced (especially for moderator jump issue)
          const prevStreamingCount = prevMessages.filter(m => isStreamingMetadata(m.metadata)).length;
          const newStreamingCount = newMessages.filter(m => isStreamingMetadata(m.metadata)).length;
          const prevModeratorIdx = prevMessages.findIndex(m => isModeratorMetadataFast(m.metadata));
          const newModeratorIdx = newMessages.findIndex(m => isModeratorMetadataFast(m.metadata));
          if (prevStreamingCount !== newStreamingCount || prevModeratorIdx !== newModeratorIdx) {
            rlog.moderator('setMessages', `prev=${prevMessages.length}(stream=${prevStreamingCount},modIdx=${prevModeratorIdx}) → new=${newMessages.length}(stream=${newStreamingCount},modIdx=${newModeratorIdx})`);
          }
          set({ messages: newMessages }, false, 'thread/setMessages');
        },
        setModelOrder: modelIds => set({ modelOrder: modelIds }, false, 'form/setModelOrder'),
        setParticipants: participants => set({ participants }, false, 'thread/setParticipants'),
        setPendingAttachmentIds: ids => set({ pendingAttachmentIds: ids }, false, 'attachments/setPendingAttachmentIds'),

        // ============================================================
        // CHANGELOG STATE - Frame 8/9
        // ============================================================

        setPendingFileParts: parts => set({ pendingFileParts: parts }, false, 'attachments/setPendingFileParts'),

        // ============================================================
        // TITLE ANIMATION STATE
        // ============================================================

        setPendingMessage: message => set({ pendingMessage: message }, false, 'form/setPendingMessage'),
        setPreSearches: preSearches => set({ preSearches }, false, 'preSearch/setPreSearches'),
        setRegeneratingRoundNumber: round => set({ regeneratingRoundNumber: round }, false, 'thread/setRegeneratingRoundNumber'),
        setScreenMode: mode => set({ screenMode: mode }, false, 'ui/setScreenMode'),

        // ============================================================
        // TRACKING STATE (deduplication)
        // ============================================================

        setSelectedMode: mode => set({ selectedMode: mode }, false, 'form/setSelectedMode'),
        setSelectedParticipants: participants => set({ selectedParticipants: participants }, false, 'form/setSelectedParticipants'),
        setShowInitialUI: show => set({ showInitialUI: show }, false, 'ui/setShowInitialUI'),

        // ============================================================
        // OPERATIONS
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
         *
         * CRITICAL: Captures participant count at round start to prevent divergence
         * between subscriptions and placeholders during the streaming phase.
         */
        startRound: (roundNumber: number, participantCount: number) => {
          // ✅ GUARD: Prevent race between resumption and user action
          // If resumption is in progress, skip this user-triggered round start
          // The resumption flow will handle setting up the round correctly
          if (get().isResumingStream) {
            rlog.stuck('startRound', `BLOCKED - resumption in progress for r${roundNumber}`);
            return;
          }

          const state = get();
          const isRound1 = roundNumber === 0;

          // ✅ FIX: Trust the passed participantCount from caller (form-actions has fresh data)
          // The state.participants array may be stale due to React batched updates.
          // Log divergence for debugging but use the passed count as source of truth.
          const stateEnabledCount = countEnabledParticipants(state.participants);
          const stateParticipantsLength = state.participants.length;

          // ✅ DIAGNOSTIC: Detect stale state (common during auto-mode participant changes)
          if (participantCount !== stateEnabledCount) {
            rlog.trigger('startRound-divergence', `r${roundNumber} passed=${participantCount} stateEnabled=${stateEnabledCount} stateLength=${stateParticipantsLength}`);
          }

          // ✅ FIX: Only block if BOTH passed count AND state count are 0
          // This prevents blocking when state is stale but caller has valid count
          if (participantCount === 0 && stateEnabledCount === 0) {
            rlog.stuck('startRound', `BLOCKED - no enabled participants for r${roundNumber} (passed=0, state=0)`);
            return;
          }

          // ✅ FIX: Trust participantCount from caller, don't clamp to potentially stale state
          // The caller (form-actions) computes this from fresh optimisticParticipants
          // Only clamp if participantCount is unreasonably high (> 10 is a sanity check)
          const MAX_REASONABLE_PARTICIPANTS = 10;
          const actualCount = participantCount > 0 && participantCount <= MAX_REASONABLE_PARTICIPANTS
            ? participantCount
            : Math.max(stateEnabledCount, 1); // Fallback to state count if passed count is invalid

          if (participantCount !== actualCount) {
            rlog.stuck('startRound', `Adjusting count from ${participantCount} to ${actualCount} (max=${MAX_REASONABLE_PARTICIPANTS})`);
          }

          // Log the appropriate frame
          if (isRound1) {
            rlog.frame(2, 'startRound', `r${roundNumber} pCount=${actualCount} - ALL placeholders appear`);
          } else {
            rlog.frame(8, 'startRound', `r${roundNumber} pCount=${actualCount} - Changelog + placeholders appear`);
          }

          rlog.phase('startRound', `IDLE→PARTICIPANTS r${roundNumber} with ${actualCount} participants`);

          // ✅ Create streaming placeholders immediately so UI shows them
          // This ensures placeholders appear on send (Frame 2/8), not on first streaming chunk
          get().createStreamingPlaceholders(roundNumber, actualCount);

          set({
            // ✅ Capture participant count for this round
            // Used by subscriptions to ensure consistent count throughout streaming
            activeRoundParticipantCount: actualCount,
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
         *
         * IMPORTANT: This function enforces invariants:
         * 1. Status cannot regress from terminal states ('complete', 'error') to non-terminal
         * 2. lastSeq can only increase (monotonic) to handle out-of-order updates
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
              // Invariant 1: Prevent status regression from terminal states
              // 'complete' and 'error' are terminal - once reached, cannot go back
              const isCurrentTerminal = isTerminalStatus(target.status);
              const isNewTerminal = isTerminalStatus(status);

              // Only allow status update if:
              // - Current status is not terminal, OR
              // - New status is also terminal (e.g., complete -> error is allowed for retry scenarios)
              if (!isCurrentTerminal || isNewTerminal) {
                target.status = status;
              }

              // Invariant 2: lastSeq is monotonically increasing
              // This handles out-of-order network updates
              if (lastSeq !== undefined) {
                const currentSeq = target.lastSeq ?? 0;
                if (lastSeq > currentSeq) {
                  target.lastSeq = lastSeq;
                }
              }

              if (errorMessage !== undefined) {
                target.errorMessage = errorMessage;
              }
            }
          }, false, `subscription/update-${entity}`);
        },

        // ============================================================
        // EXTERNAL CALLBACKS
        // ============================================================

        updatePartialPreSearchData: (roundNumber: number, partialData: unknown) => {
          set((draft) => {
            const ps = draft.preSearches.find(p => p.roundNumber === roundNumber);
            if (ps) {
              (ps as { searchData: unknown }).searchData = partialData;
              // ✅ FIX: Update status to STREAMING when data arrives
              // Without this, status stays 'pending' and isStreamingNow=false,
              // causing result skeletons to not render while waiting for results
              if (ps.status === 'pending') {
                ps.status = 'streaming' as typeof ps.status;
                rlog.presearch('status-change', `r${roundNumber} pending→streaming`);
              }
              // Debug: Log query count for gradual streaming visibility
              const queryCount = (partialData as { queries?: unknown[] } | null)?.queries?.length ?? 0;
              const resultCount = (partialData as { results?: unknown[] } | null)?.results?.length ?? 0;
              rlog.presearch('partial-update', `r${roundNumber} queries=${queryCount} results=${resultCount} status=${ps.status}`);
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
