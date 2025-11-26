/**
 * Multi-Round Web Search Flow Integration Tests
 *
 * Tests the complete chat flow with web search enabled across multiple rounds
 * as described in FLOW_DOCUMENTATION.md. Tests the full user journey from
 * overview screen through thread screen with configuration changes.
 *
 * FLOW TESTED (per FLOW_DOCUMENTATION.md):
 *
 * ROUND 1:
 * 1. Overview screen initialization and configuration
 * 2. Enable web search + select participants + choose mode
 * 3. Submit first message → thread creation
 * 4. Pre-search execution (BLOCKING before participants)
 * 5. Sequential participant streaming (each sees prior responses + search context)
 * 6. Analysis creation → pending → streaming → complete
 * 7. Slug polling → AI-generated title detection
 * 8. Navigation → router.push to /chat/[slug]
 *
 * ROUND 2 (on thread screen):
 * 1. Configuration changes (add/remove participants, change mode)
 * 2. Submit second message
 * 3. Pre-search for new round (independent search)
 * 4. Sequential participant streaming
 * 5. Analysis for round 2
 *
 * Location: /src/stores/chat/__tests__/multi-round-web-search-flow.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  ScreenModes,
  ThreadStatuses,
} from '@/api/core/enums';
import type {
  ChatParticipant,
  StoredModeratorAnalysis,
  StoredPreSearch,
} from '@/api/routes/chat/schema';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockAnalysisPayload,
  createMockMessage,
  createMockParticipant,
  createMockParticipantConfig,
  createMockPreSearch,
  createMockPreSearchDataPayload,
  createMockThread,
  createMockUserMessage,
  createPendingPreSearch,
  createStreamingAnalysis,
  createStreamingPreSearch,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

// ============================================================================
// MULTI-ROUND WEB SEARCH FLOW TESTS
// ============================================================================

describe('multi-Round Web Search Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // COMPLETE TWO-ROUND FLOW WITH WEB SEARCH
  // ==========================================================================

  describe('complete Two-Round Flow with Web Search', () => {
    it('should execute full two-round conversation flow with web search and configuration changes', () => {
      // ========================================================================
      // ROUND 1: OVERVIEW SCREEN → THREAD CREATION → NAVIGATION
      // ========================================================================

      // STEP 1.1: Initialize overview screen
      // Per docs: "User lands on /chat (ChatOverviewScreen)"
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
      expect(store.getState().showInitialUI).toBe(true);

      // STEP 1.2: Configure chat with participants, mode, and web search
      // Per docs: "Selecting AI Models", "Choosing Mode", "Enable Web Search toggle"
      const initialParticipants = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4', role: 'The Analyst' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-3', role: 'The Critic' }),
        createMockParticipantConfig(2, { modelId: 'google/gemini-pro', role: 'The Innovator' }),
      ];

      store.getState().setSelectedParticipants(initialParticipants);
      store.getState().setSelectedMode(ChatModes.ANALYZING);
      store.getState().setEnableWebSearch(true);
      store.getState().setInputValue('What are the latest trends in AI development for 2024?');

      // Verify configuration
      expect(store.getState().selectedParticipants).toHaveLength(3);
      expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().inputValue).toBeTruthy();

      // STEP 1.3: Submit first message - thread creation begins
      // Per docs: "User Action: Types question and clicks send"
      store.getState().setIsCreatingThread(true);
      store.getState().setShowInitialUI(false);

      // Verify UI transition
      expect(store.getState().showInitialUI).toBe(false);
      expect(store.getState().isCreatingThread).toBe(true);

      // STEP 1.4: Thread creation API response
      // Per docs: "System creates conversation record in database"
      const thread = createMockThread({
        id: 'thread-ai-trends-2024',
        title: 'New Chat',
        slug: 'new-chat-ai-trends',
        isAiGeneratedTitle: false,
        mode: ChatModes.ANALYZING,
        enableWebSearch: true,
        status: ThreadStatuses.ACTIVE,
      });

      const dbParticipants: ChatParticipant[] = [
        createMockParticipant(0, {
          id: 'part-gpt4',
          threadId: 'thread-ai-trends-2024',
          modelId: 'openai/gpt-4',
          role: 'The Analyst',
        }),
        createMockParticipant(1, {
          id: 'part-claude',
          threadId: 'thread-ai-trends-2024',
          modelId: 'anthropic/claude-3',
          role: 'The Critic',
        }),
        createMockParticipant(2, {
          id: 'part-gemini',
          threadId: 'thread-ai-trends-2024',
          modelId: 'google/gemini-pro',
          role: 'The Innovator',
        }),
      ];

      const userMessageR1 = createMockUserMessage(0, 'What are the latest trends in AI development for 2024?');

      // Initialize thread with API response
      store.getState().initializeThread(thread, dbParticipants, [userMessageR1]);
      store.getState().setCreatedThreadId('thread-ai-trends-2024');
      store.getState().setIsCreatingThread(false);
      store.getState().setInputValue('');

      // Verify thread initialization
      expect(store.getState().thread?.id).toBe('thread-ai-trends-2024');
      expect(store.getState().thread?.enableWebSearch).toBe(true);
      expect(store.getState().participants).toHaveLength(3);
      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().createdThreadId).toBe('thread-ai-trends-2024');

      // STEP 1.5: Pre-search phase begins
      // Per docs: "Pre-search MUST complete before participant streaming starts"
      // Per docs: "PENDING → STREAMING → COMPLETED"

      // Backend creates PENDING pre-search record
      const preSearchR1: StoredPreSearch = {
        id: 'presearch-r0-001',
        threadId: 'thread-ai-trends-2024',
        roundNumber: 0,
        userQuery: 'What are the latest trends in AI development for 2024?',
        status: AnalysisStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      store.getState().addPreSearch(preSearchR1);
      store.getState().markPreSearchTriggered(0);

      // Verify pre-search is blocking
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);

      // Pre-search starts streaming
      // Per docs: "AI generates optimized search query from user's question"
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);

      // Pre-search completes with results
      // Per docs: "Results stream to frontend via Server-Sent Events (SSE)"
      const searchDataR1 = createMockPreSearchDataPayload();
      store.getState().updatePreSearchData(0, searchDataR1);

      // Verify pre-search completed
      // Per docs: "Only when status is COMPLETED will participant streaming proceed"
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(store.getState().preSearches[0].searchData).toBeDefined();

      // STEP 1.6: Participant streaming begins (after pre-search)
      // Per docs: "First AI responds → Second AI responds (sees first AI's response) → Third AI responds"
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // First participant (GPT-4 - The Analyst) responds
      // Per docs: "First AI sees only user's question" (plus search context)
      const msgP0R0: UIMessage = createMockMessage(0, 0, {
        id: 'thread-ai-trends-2024_r0_p0',
        parts: [{
          type: 'text',
          text: 'Based on my analysis of the search results and current trends, AI development in 2024 is characterized by three major themes: 1) Multimodal capabilities becoming standard, 2) Smaller, more efficient models, 3) Agent-based systems...',
        }],
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'part-gpt4',
          participantIndex: 0,
          participantRole: 'The Analyst',
          model: 'openai/gpt-4',
        },
      });

      store.getState().setMessages(prev => [...prev, msgP0R0]);
      store.getState().setCurrentParticipantIndex(1);

      // Verify first participant response
      expect(store.getState().messages).toHaveLength(2);

      // Second participant (Claude - The Critic) responds
      // Per docs: "Second AI sees user's question + first AI's response"
      const msgP1R0: UIMessage = createMockMessage(1, 0, {
        id: 'thread-ai-trends-2024_r0_p1',
        parts: [{
          type: 'text',
          text: 'While I agree with the analysis of multimodal trends, I want to critically examine the claim about smaller models. The search results show that while efficiency is improving, the largest models still dominate benchmarks. We should question whether "smaller is better" is actually the trend or just wishful thinking...',
        }],
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'part-claude',
          participantIndex: 1,
          participantRole: 'The Critic',
          model: 'anthropic/claude-3',
        },
      });

      store.getState().setMessages(prev => [...prev, msgP1R0]);
      store.getState().setCurrentParticipantIndex(2);

      // Third participant (Gemini - The Innovator) responds
      // Per docs: "Third AI sees user's question + both previous responses"
      const msgP2R0: UIMessage = createMockMessage(2, 0, {
        id: 'thread-ai-trends-2024_r0_p2',
        parts: [{
          type: 'text',
          text: 'Building on both perspectives, I see an innovative synthesis: the future isn\'t about size OR efficiency alone, but about specialized architectures. The search results hint at this with mentions of mixture-of-experts and sparse attention mechanisms. I predict 2024 will be remembered as the year of architectural innovation...',
        }],
        metadata: {
          role: 'participant',
          roundNumber: 0,
          participantId: 'part-gemini',
          participantIndex: 2,
          participantRole: 'The Innovator',
          model: 'google/gemini-pro',
        },
      });

      store.getState().setMessages(prev => [...prev, msgP2R0]);

      // Complete participant streaming
      store.getState().setIsStreaming(false);

      // Verify all participants responded
      expect(store.getState().messages).toHaveLength(4); // user + 3 participants
      expect(store.getState().isStreaming).toBe(false);

      // STEP 1.7: Analysis creation and streaming
      // Per docs: "After the LAST selected AI completes response (automatic)"
      store.getState().markAnalysisCreated(0);
      store.getState().setIsCreatingAnalysis(true);

      const analysisR0: StoredModeratorAnalysis = {
        id: 'analysis-r0-001',
        threadId: 'thread-ai-trends-2024',
        roundNumber: 0,
        mode: ChatModes.ANALYZING,
        userQuestion: 'What are the latest trends in AI development for 2024?',
        status: AnalysisStatuses.PENDING,
        participantMessageIds: [
          'thread-ai-trends-2024_r0_p0',
          'thread-ai-trends-2024_r0_p1',
          'thread-ai-trends-2024_r0_p2',
        ],
        analysisData: null,
        errorMessage: null,
        completedAt: null,
        createdAt: new Date(),
      };

      store.getState().addAnalysis(analysisR0);
      store.getState().setIsCreatingAnalysis(false);

      // Analysis starts streaming
      // Per docs: "Analysis sections appear in order: Leaderboard, Skills Chart, Individual Cards, Summary, Conclusion"
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
      store.getState().setIsStreaming(true);

      // Analysis completes with full data
      const analysisDataR0 = createMockAnalysisPayload(0, {
        mode: ChatModes.ANALYZING,
      });

      store.getState().updateAnalysisData(0, analysisDataR0);
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Verify analysis completion
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(store.getState().analyses[0].analysisData).toBeDefined();

      // STEP 1.8: Slug polling detects AI-generated title
      // Per docs: "Frontend polls /api/v1/chat/threads/{id}/slug-status every 3s"
      const threadWithAiTitle = createMockThread({
        id: 'thread-ai-trends-2024',
        title: 'AI Development Trends 2024: Multimodal, Efficient, and Agent-Based',
        slug: 'ai-development-trends-2024-multimodal-efficient-agent-based',
        isAiGeneratedTitle: true,
        mode: ChatModes.ANALYZING,
        enableWebSearch: true,
      });

      store.getState().setThread(threadWithAiTitle);

      // Verify AI title update
      expect(store.getState().thread?.isAiGeneratedTitle).toBe(true);
      expect(store.getState().thread?.title).toContain('AI Development Trends');

      // STEP 1.9: Navigation to thread screen
      // Per docs: "After analysis completes: Automatic navigation to /chat/[slug]"
      // All navigation conditions are met
      expect(store.getState().thread?.isAiGeneratedTitle).toBe(true);
      expect(store.getState().thread?.slug).toBeDefined();
      expect(store.getState().analyses[0]?.status).toBe(AnalysisStatuses.COMPLETE);

      // Simulate navigation complete
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Verify navigation
      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);

      // ========================================================================
      // ROUND 2: THREAD SCREEN → CONFIGURATION CHANGES → NEW ROUND
      // ========================================================================

      // STEP 2.1: User makes configuration changes on thread screen
      // Per docs: "Add AI models", "Remove AI models", "Switch conversation mode"

      // Remove one participant (Gemini) and add a new one (Mistral)
      const updatedParticipants = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4', role: 'The Analyst' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-3', role: 'The Critic' }),
        // Gemini removed, Mistral added
        createMockParticipantConfig(2, { modelId: 'mistral/mistral-large', role: 'The Synthesizer' }),
      ];

      store.getState().setSelectedParticipants(updatedParticipants);

      // Change mode from Analyzing to Debating
      store.getState().setSelectedMode(ChatModes.DEBATING);
      store.getState().setHasPendingConfigChanges(true);

      // Verify configuration changes
      expect(store.getState().selectedParticipants).toHaveLength(3);
      expect(store.getState().selectedParticipants[2].modelId).toBe('mistral/mistral-large');
      expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
      expect(store.getState().hasPendingConfigChanges).toBe(true);

      // STEP 2.2: User submits second message
      // Per docs: "Submit second message"
      const trimmedMessage = 'Given these trends, which approach will dominate: open-source or proprietary AI?';
      store.getState().setInputValue(trimmedMessage);

      // Prepare for new message
      // Per docs: "Changes save when user submits next message"
      store.getState().prepareForNewMessage(trimmedMessage, [
        'openai/gpt-4',
        'anthropic/claude-3',
        'mistral/mistral-large',
      ]);

      // Verify message preparation
      expect(store.getState().pendingMessage).toBe(trimmedMessage);
      expect(store.getState().isWaitingForChangelog).toBe(true);

      // Update thread with new config (simulates PATCH response)
      const updatedDbParticipants: ChatParticipant[] = [
        createMockParticipant(0, {
          id: 'part-gpt4',
          threadId: 'thread-ai-trends-2024',
          modelId: 'openai/gpt-4',
          role: 'The Analyst',
        }),
        createMockParticipant(1, {
          id: 'part-claude',
          threadId: 'thread-ai-trends-2024',
          modelId: 'anthropic/claude-3',
          role: 'The Critic',
        }),
        createMockParticipant(2, {
          id: 'part-mistral',
          threadId: 'thread-ai-trends-2024',
          modelId: 'mistral/mistral-large',
          role: 'The Synthesizer',
        }),
      ];

      store.getState().updateParticipants(updatedDbParticipants);
      store.getState().setExpectedParticipantIds(['openai/gpt-4', 'anthropic/claude-3', 'mistral/mistral-large']);

      // Update thread mode
      const threadWithNewMode = {
        ...store.getState().thread!,
        mode: ChatModes.DEBATING,
      };
      store.getState().setThread(threadWithNewMode);

      // Add user message for round 1 (0-indexed, so second round is index 1)
      // ✅ FIX: prepareForNewMessage already added optimistic user message, no need for manual setMessages
      // The optimistic message was already added by prepareForNewMessage(trimmedMessage, ...)

      // Clear flags
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setPendingMessage(null);
      store.getState().setHasPendingConfigChanges(false);
      store.getState().setInputValue('');

      // Verify round 2 setup
      // ✅ FIX: 4 from R1 + 1 optimistic user R2 = 5
      expect(store.getState().messages).toHaveLength(5);
      expect(store.getState().participants[2].modelId).toBe('mistral/mistral-large');
      expect(store.getState().thread?.mode).toBe(ChatModes.DEBATING);

      // STEP 2.3: Pre-search for round 2
      // Per docs: "Executes on EVERY round when enabled (not just initial round)"
      const preSearchR2: StoredPreSearch = {
        id: 'presearch-r1-001',
        threadId: 'thread-ai-trends-2024',
        roundNumber: 1,
        userQuery: trimmedMessage,
        status: AnalysisStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      store.getState().addPreSearch(preSearchR2);
      store.getState().markPreSearchTriggered(1);

      // Pre-search streams and completes
      store.getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);

      const searchDataR2 = createMockPreSearchDataPayload();
      store.getState().updatePreSearchData(1, searchDataR2);

      // Verify round 2 pre-search
      expect(store.getState().preSearches).toHaveLength(2);
      expect(store.getState().preSearches[1].roundNumber).toBe(1);
      expect(store.getState().preSearches[1].status).toBe(AnalysisStatuses.COMPLETE);

      // STEP 2.4: Participant streaming for round 2
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // First participant (GPT-4) responds for round 2
      const msgP0R1: UIMessage = createMockMessage(0, 1, {
        id: 'thread-ai-trends-2024_r1_p0',
        parts: [{
          type: 'text',
          text: 'I argue that open-source AI will ultimately dominate. The search results show growing momentum in open models, and network effects favor openness. Proprietary advantages are temporary...',
        }],
        metadata: {
          role: 'participant',
          roundNumber: 1,
          participantId: 'part-gpt4',
          participantIndex: 0,
          participantRole: 'The Analyst',
          model: 'openai/gpt-4',
        },
      });

      store.getState().setMessages(prev => [...prev, msgP0R1]);
      store.getState().setCurrentParticipantIndex(1);

      // Second participant (Claude) responds
      const msgP1R1: UIMessage = createMockMessage(1, 1, {
        id: 'thread-ai-trends-2024_r1_p1',
        parts: [{
          type: 'text',
          text: 'I must counter this argument strongly. Proprietary AI has crucial advantages: better safety controls, liability protection, enterprise support. The enterprise search result shows why businesses prefer closed solutions. Open-source momentum may plateau...',
        }],
        metadata: {
          role: 'participant',
          roundNumber: 1,
          participantId: 'part-claude',
          participantIndex: 1,
          participantRole: 'The Critic',
          model: 'anthropic/claude-3',
        },
      });

      store.getState().setMessages(prev => [...prev, msgP1R1]);
      store.getState().setCurrentParticipantIndex(2);

      // Third participant (Mistral - new) responds
      const msgP2R1: UIMessage = createMockMessage(2, 1, {
        id: 'thread-ai-trends-2024_r1_p2',
        parts: [{
          type: 'text',
          text: 'Both positions have merit, but I propose a synthesis: hybrid approaches will dominate. Companies will use open-source for innovation and proprietary for production. This mirrors the Linux/enterprise software dynamic. Neither extreme will "win"...',
        }],
        metadata: {
          role: 'participant',
          roundNumber: 1,
          participantId: 'part-mistral',
          participantIndex: 2,
          participantRole: 'The Synthesizer',
          model: 'mistral/mistral-large',
        },
      });

      store.getState().setMessages(prev => [...prev, msgP2R1]);

      // Complete participant streaming
      store.getState().setIsStreaming(false);

      // Verify round 2 messages
      expect(store.getState().messages).toHaveLength(8); // 4 R1 + 1 user R2 + 3 participants R2

      // STEP 2.5: Analysis for round 2
      store.getState().markAnalysisCreated(1);

      const analysisR1: StoredModeratorAnalysis = {
        id: 'analysis-r1-001',
        threadId: 'thread-ai-trends-2024',
        roundNumber: 1,
        mode: ChatModes.DEBATING,
        userQuestion: trimmedMessage,
        status: AnalysisStatuses.PENDING,
        participantMessageIds: [
          'thread-ai-trends-2024_r1_p0',
          'thread-ai-trends-2024_r1_p1',
          'thread-ai-trends-2024_r1_p2',
        ],
        analysisData: null,
        errorMessage: null,
        completedAt: null,
        createdAt: new Date(),
      };

      store.getState().addAnalysis(analysisR1);
      store.getState().updateAnalysisStatus(1, AnalysisStatuses.STREAMING);
      store.getState().setIsStreaming(true);

      // Analysis completes
      const analysisDataR1 = createMockAnalysisPayload(1);
      store.getState().updateAnalysisData(1, analysisDataR1);
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // ========================================================================
      // FINAL VERIFICATION
      // ========================================================================

      const finalState = store.getState();

      // Verify complete state after two rounds
      expect(finalState.screenMode).toBe(ScreenModes.THREAD);
      expect(finalState.thread?.id).toBe('thread-ai-trends-2024');
      expect(finalState.thread?.isAiGeneratedTitle).toBe(true);
      expect(finalState.thread?.mode).toBe(ChatModes.DEBATING);
      expect(finalState.thread?.enableWebSearch).toBe(true);

      // Verify messages structure
      expect(finalState.messages).toHaveLength(8);
      // Round 0: user + 3 participants = 4
      // Round 1: user + 3 participants = 4
      // Total = 8

      // Verify pre-searches for both rounds
      expect(finalState.preSearches).toHaveLength(2);
      expect(finalState.preSearches[0].roundNumber).toBe(0);
      expect(finalState.preSearches[1].roundNumber).toBe(1);
      expect(finalState.preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(finalState.preSearches[1].status).toBe(AnalysisStatuses.COMPLETE);

      // Verify analyses for both rounds
      expect(finalState.analyses).toHaveLength(2);
      expect(finalState.analyses[0].roundNumber).toBe(0);
      expect(finalState.analyses[1].roundNumber).toBe(1);
      expect(finalState.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(finalState.analyses[1].status).toBe(AnalysisStatuses.COMPLETE);
      expect(finalState.analyses[0].mode).toBe(ChatModes.ANALYZING);
      expect(finalState.analyses[1].mode).toBe(ChatModes.DEBATING);

      // Verify participants updated
      expect(finalState.participants).toHaveLength(3);
      expect(finalState.participants[2].modelId).toBe('mistral/mistral-large');

      // Verify tracking state
      expect(finalState.hasAnalysisBeenCreated(0)).toBe(true);
      expect(finalState.hasAnalysisBeenCreated(1)).toBe(true);
      expect(finalState.hasPreSearchBeenTriggered(0)).toBe(true);
      expect(finalState.hasPreSearchBeenTriggered(1)).toBe(true);

      // Verify clean state (no ongoing operations)
      expect(finalState.isStreaming).toBe(false);
      expect(finalState.isCreatingThread).toBe(false);
      expect(finalState.isCreatingAnalysis).toBe(false);
      expect(finalState.isRegenerating).toBe(false);
      expect(finalState.pendingMessage).toBeNull();
    });
  });

  // ==========================================================================
  // PRE-SEARCH BLOCKING BEHAVIOR
  // ==========================================================================

  describe('pre-Search Blocking Behavior', () => {
    it('should block participant streaming until pre-search completes', () => {
      // Setup thread with web search enabled
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setShowInitialUI(false);

      // Add pending pre-search
      const preSearch = createPendingPreSearch(0);
      store.getState().addPreSearch(preSearch);

      // Pre-search is PENDING - streaming should be blocked
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

      // Simulate blocking check
      const shouldWait = store.getState().preSearches.some(
        ps => ps.roundNumber === 0
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );
      expect(shouldWait).toBe(true);

      // Pre-search starts streaming
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

      // Still should wait
      const stillWaiting = store.getState().preSearches.some(
        ps => ps.roundNumber === 0
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );
      expect(stillWaiting).toBe(true);

      // Pre-search completes
      const searchData = createMockPreSearchDataPayload();
      store.getState().updatePreSearchData(0, searchData);

      // Now streaming can proceed
      const canStream = store.getState().preSearches.every(
        ps => ps.roundNumber !== 0 || ps.status === AnalysisStatuses.COMPLETE,
      );
      expect(canStream).toBe(true);
    });

    it('should execute independent pre-search for each round', () => {
      // Setup
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);

      // Round 0 pre-search
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().markPreSearchTriggered(0);
      const searchDataR0 = createMockPreSearchDataPayload();
      store.getState().updatePreSearchData(0, searchDataR0);

      // Round 1 pre-search (independent)
      store.getState().addPreSearch(createPendingPreSearch(1));
      store.getState().markPreSearchTriggered(1);
      const searchDataR1 = createMockPreSearchDataPayload();
      store.getState().updatePreSearchData(1, searchDataR1);

      // Verify both rounds have independent pre-searches
      const preSearches = store.getState().preSearches;
      expect(preSearches).toHaveLength(2);
      expect(preSearches[0].roundNumber).toBe(0);
      expect(preSearches[1].roundNumber).toBe(1);
      expect(preSearches[0].searchData).toBeDefined();
      expect(preSearches[1].searchData).toBeDefined();
    });
  });

  // ==========================================================================
  // CONFIGURATION CHANGE TRACKING
  // ==========================================================================

  describe('configuration Change Tracking', () => {
    it('should track pending configuration changes correctly', () => {
      // Setup thread screen
      const thread = createMockThread({ mode: ChatModes.ANALYZING });
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      store.getState().initializeThread(thread, participants);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Initial state
      expect(store.getState().hasPendingConfigChanges).toBe(false);

      // Change mode
      store.getState().setSelectedMode(ChatModes.DEBATING);
      store.getState().setHasPendingConfigChanges(true);

      expect(store.getState().hasPendingConfigChanges).toBe(true);

      // Changes applied on message submit
      store.getState().setHasPendingConfigChanges(false);
      expect(store.getState().hasPendingConfigChanges).toBe(false);
    });

    it('should clear config changes flag after message submission', () => {
      store.getState().setHasPendingConfigChanges(true);
      expect(store.getState().hasPendingConfigChanges).toBe(true);

      // Simulate message submission clearing the flag
      store.getState().prepareForNewMessage('test message', []);

      // prepareForNewMessage doesn't clear hasPendingConfigChanges
      // It should be cleared manually after the update
      store.getState().setHasPendingConfigChanges(false);
      expect(store.getState().hasPendingConfigChanges).toBe(false);
    });
  });

  // ==========================================================================
  // ROUND NUMBER CONSISTENCY
  // ==========================================================================

  describe('round Number Consistency', () => {
    it('should maintain consistent round numbers across messages, pre-searches, and analyses', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      // Round 0
      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().addPreSearch(createMockPreSearch({ roundNumber: 0 }));
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));

      // Round 1
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1)]);
      store.getState().addPreSearch(createMockPreSearch({ roundNumber: 1 }));
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 1 }));

      // Verify round numbers
      const state = store.getState();

      // Messages
      expect(state.messages[0].metadata?.roundNumber).toBe(0); // User R0
      expect(state.messages[1].metadata?.roundNumber).toBe(0); // Participant R0
      expect(state.messages[2].metadata?.roundNumber).toBe(1); // User R1
      expect(state.messages[3].metadata?.roundNumber).toBe(1); // Participant R1

      // Pre-searches
      expect(state.preSearches[0].roundNumber).toBe(0);
      expect(state.preSearches[1].roundNumber).toBe(1);

      // Analyses
      expect(state.analyses[0].roundNumber).toBe(0);
      expect(state.analyses[1].roundNumber).toBe(1);
    });
  });

  // ==========================================================================
  // ERROR HANDLING IN FLOW
  // ==========================================================================

  describe('error Handling in Flow', () => {
    it('should handle pre-search failure and allow streaming to continue', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search fails
      const preSearch = createStreamingPreSearch(0);
      store.getState().addPreSearch(preSearch);
      store.getState().updatePreSearchError(0, 'Search service unavailable');

      // Verify error state
      expect(store.getState().preSearches[0].errorMessage).toBe('Search service unavailable');

      // Streaming should still be able to proceed after failure
      // (pre-search failure is non-blocking after completion)
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setIsStreaming(false);

      // Verify streaming completed despite pre-search failure
      expect(store.getState().messages).toHaveLength(2);
    });

    it('should handle analysis failure without blocking conversation', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];
      const messages: UIMessage[] = [createMockUserMessage(0), createMockMessage(0, 0)];
      store.getState().initializeThread(thread, participants, messages);

      // Analysis fails
      store.getState().addAnalysis(createStreamingAnalysis(0));
      store.getState().updateAnalysisError(0, 'Analysis generation failed');

      // Verify error state
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.FAILED);
      expect(store.getState().analyses[0].errorMessage).toBe('Analysis generation failed');

      // User should be able to continue conversation
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1)]);
      expect(store.getState().messages).toHaveLength(3);
    });

    it('should handle participant streaming error and allow retry', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Start streaming
      store.getState().setIsStreaming(true);

      // First participant succeeds
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

      // Second participant fails
      store.getState().setError(new Error('Rate limit exceeded'));
      store.getState().setIsStreaming(false);

      // Verify error state
      expect(store.getState().error?.message).toBe('Rate limit exceeded');
      expect(store.getState().messages).toHaveLength(2);

      // Clear error and retry
      store.getState().setError(null);
      store.getState().startRegeneration(0);

      // Verify retry state
      expect(store.getState().isRegenerating).toBe(true);
      expect(store.getState().regeneratingRoundNumber).toBe(0);
    });
  });

  // ==========================================================================
  // NAVIGATION CONDITIONS
  // ==========================================================================

  describe('navigation Conditions', () => {
    it('should only navigate when all conditions are met', () => {
      const thread = createMockThread({
        isAiGeneratedTitle: false,
        slug: 'temp-slug',
      });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setShowInitialUI(false);
      store.getState().setCreatedThreadId(thread.id);

      // Condition 1: Screen mode must be overview
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);

      // Condition 2: AI-generated title must be ready
      expect(store.getState().thread?.isAiGeneratedTitle).toBe(false); // Not ready yet

      // Condition 3: Analysis must be complete
      store.getState().addAnalysis(createMockAnalysis({ status: AnalysisStatuses.STREAMING }));
      expect(store.getState().analyses[0].status).not.toBe(AnalysisStatuses.COMPLETE); // Not ready yet

      // Navigation should NOT happen yet
      // (In real code, flow-controller would check these conditions)

      // Now complete analysis
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);

      // Now update AI title
      store.getState().setThread({
        ...thread,
        isAiGeneratedTitle: true,
        title: 'AI Generated Title',
        slug: 'ai-generated-slug',
      });

      // All conditions now met
      const state = store.getState();
      expect(state.screenMode).toBe(ScreenModes.OVERVIEW);
      expect(state.thread?.isAiGeneratedTitle).toBe(true);
      expect(state.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);

      // Navigation can proceed
      store.getState().setScreenMode(ScreenModes.THREAD);
      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    });
  });

  // ==========================================================================
  // CONTEXT SHARING BETWEEN PARTICIPANTS
  // ==========================================================================

  describe('context Sharing Between Participants', () => {
    it('should verify message context structure for sequential responses', () => {
      const thread = createMockThread();
      const participants = [
        createMockParticipant(0, { modelId: 'model-a' }),
        createMockParticipant(1, { modelId: 'model-b' }),
        createMockParticipant(2, { modelId: 'model-c' }),
      ];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Participant 0 responds (sees: user message only)
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

      // Participant 1 responds (sees: user + participant 0)
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);

      // Participant 2 responds (sees: user + participant 0 + participant 1)
      store.getState().setMessages(prev => [...prev, createMockMessage(2, 0)]);

      const messages = store.getState().messages;

      // Verify message order and structure
      expect(messages).toHaveLength(4);
      expect(messages[0].role).toBe('user');
      expect(messages[1].metadata?.participantIndex).toBe(0);
      expect(messages[2].metadata?.participantIndex).toBe(1);
      expect(messages[3].metadata?.participantIndex).toBe(2);

      // Each subsequent participant can see all prior messages
      // This is verified by the message order being maintained
    });
  });
});
