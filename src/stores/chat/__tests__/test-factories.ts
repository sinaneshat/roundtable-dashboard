/**
 * Test Mock Factories - Type-Safe Test Data Generation
 *
 * Following type-inference-patterns.md: All types inferred from schemas
 * NO `any`, NO `unknown`, NO loose `Partial<>` usage
 *
 * **Pattern**:
 * 1. Import actual types from schemas
 * 2. Create factories with ALL required fields
 * 3. Allow overrides via Partial<> parameter
 * 4. Use enum constants for all status fields
 *
 * Location: /src/stores/chat/__tests__/test-factories.ts
 */

import type { UIMessage } from 'ai';

import {
  AgreementStatuses,
  AnalysisStatuses,
  ChatModes,
  ConfidenceWeightings,
  DebatePhases,
  EvidenceStrengths,
  PreSearchStatuses,
  ThreadStatuses,
  UIMessageRoles,
  VoteTypes,
} from '@/api/core/enums';
import type {
  ChatParticipant,
  ChatThread,
  ModeratorAnalysisPayload,
  PreSearchDataPayload,
  StoredModeratorAnalysis,
  StoredPreSearch,
} from '@/api/routes/chat/schema';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';

// ============================================================================
// Chat Thread Factories
// ============================================================================

/**
 * Create mock ChatThread with all required fields
 */
export function createMockThread(
  overrides?: Partial<ChatThread>,
): ChatThread {
  return {
    id: 'thread-123',
    userId: 'user-456',
    title: 'Test Thread',
    slug: 'test-thread-slug',
    isAiGeneratedTitle: false,
    mode: ChatModes.DEBATING,
    enableWebSearch: false,
    status: ThreadStatuses.ACTIVE,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Analysis Factories
// ============================================================================

/**
 * Create mock StoredModeratorAnalysis with all required fields
 * Uses AnalysisStatuses enum for type-safe status
 */
export function createMockAnalysis(
  overrides?: Partial<StoredModeratorAnalysis>,
): StoredModeratorAnalysis {
  return {
    id: 'analysis-1',
    threadId: 'thread-123',
    roundNumber: 0,
    mode: ChatModes.DEBATING,
    userQuestion: 'What is the best approach?',
    status: AnalysisStatuses.COMPLETE,
    analysisData: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create mock analysis in PENDING status
 */
export function createPendingAnalysis(
  roundNumber = 0,
): StoredModeratorAnalysis {
  return createMockAnalysis({
    roundNumber,
    status: AnalysisStatuses.PENDING,
    analysisData: null,
  });
}

/**
 * Create mock analysis in STREAMING status
 */
export function createStreamingAnalysis(
  roundNumber = 0,
): StoredModeratorAnalysis {
  return createMockAnalysis({
    roundNumber,
    status: AnalysisStatuses.STREAMING,
    analysisData: null,
    createdAt: new Date(Date.now() - 5000), // 5 seconds ago
  });
}

/**
 * Create mock analysis that has timed out (>60s streaming)
 */
export function createTimedOutAnalysis(
  roundNumber = 0,
): StoredModeratorAnalysis {
  return createMockAnalysis({
    roundNumber,
    status: AnalysisStatuses.STREAMING,
    createdAt: new Date(Date.now() - 61000), // 61 seconds ago
  });
}

// ============================================================================
// Pre-Search Factories
// ============================================================================

/**
 * Create mock StoredPreSearch with all required fields
 * Uses PreSearchStatuses enum for type-safe status
 */
export function createMockPreSearch(
  overrides?: Partial<StoredPreSearch>,
): StoredPreSearch {
  return {
    id: 'pre-search-1',
    threadId: 'thread-123',
    roundNumber: 0,
    userQuery: 'What is the weather?',
    status: PreSearchStatuses.COMPLETE,
    searchData: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create mock pre-search in PENDING status
 * NOTE: Backend uses AnalysisStatuses.PENDING for pre-search records
 */
export function createPendingPreSearch(
  roundNumber = 0,
): StoredPreSearch {
  return createMockPreSearch({
    roundNumber,
    status: AnalysisStatuses.PENDING,
  });
}

/**
 * Create mock pre-search in STREAMING status
 */
export function createStreamingPreSearch(
  roundNumber = 0,
): StoredPreSearch {
  return createMockPreSearch({
    roundNumber,
    status: PreSearchStatuses.STREAMING,
  });
}

// ============================================================================
// Participant Factories
// ============================================================================

/**
 * Create mock ChatParticipant with all required fields
 */
export function createMockParticipant(
  participantIndex: number,
  overrides?: Partial<ChatParticipant>,
): ChatParticipant {
  return {
    id: `participant-${participantIndex}`,
    threadId: 'thread-123',
    modelId: 'openai/gpt-4',
    role: null,
    priority: participantIndex,
    isEnabled: true,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Create mock ParticipantConfig (frontend representation)
 */
export function createMockParticipantConfig(
  participantIndex: number,
  overrides?: Partial<ParticipantConfig>,
): ParticipantConfig {
  return {
    participantIndex,
    modelId: 'openai/gpt-4',
    role: null,
    ...overrides,
  };
}

// ============================================================================
// Message Factories
// ============================================================================

/**
 * Create mock UIMessage (AI SDK type)
 */
export function createMockMessage(
  participantIndex: number,
  roundNumber: number,
  overrides?: Partial<UIMessage>,
): UIMessage {
  return {
    id: `thread-123_r${roundNumber}_p${participantIndex}`,
    role: UIMessageRoles.ASSISTANT,
    parts: [
      {
        type: 'text',
        text: `Response from participant ${participantIndex}`,
      },
    ],
    metadata: {
      role: 'participant',
      roundNumber,
      participantId: `participant-${participantIndex}`,
      participantIndex,
      participantRole: null,
      model: 'openai/gpt-4',
    },
    ...overrides,
  };
}

/**
 * Create mock user message
 */
export function createMockUserMessage(
  roundNumber: number,
  text = 'Test question',
): UIMessage {
  return {
    id: `user-msg-${roundNumber}`,
    role: UIMessageRoles.USER,
    parts: [
      {
        type: 'text',
        text,
      },
    ],
    metadata: {
      role: UIMessageRoles.USER,
      roundNumber,
    },
  };
}

// ============================================================================
// Utility Factories
// ============================================================================

/**
 * Create multiple participants
 */
export function createMockParticipants(count: number): ChatParticipant[] {
  return Array.from({ length: count }, (_, i) => createMockParticipant(i));
}

/**
 * Create multiple participant configs
 */
export function createMockParticipantConfigs(count: number): ParticipantConfig[] {
  return Array.from({ length: count }, (_, i) => createMockParticipantConfig(i));
}

/**
 * Create complete round of messages (user + all participants)
 */
export function createMockRoundMessages(
  roundNumber: number,
  participantCount: number,
): UIMessage[] {
  return [
    createMockUserMessage(roundNumber),
    ...Array.from({ length: participantCount }, (_, i) =>
      createMockMessage(i, roundNumber)),
  ];
}

// ============================================================================
// Payload Factories - Type-Safe Data for Store Updates
// ============================================================================

/**
 * Create mock PreSearchDataPayload with all required fields
 * Matches the schema structure exactly for type safety
 */
export function createMockPreSearchDataPayload(
  overrides?: Partial<PreSearchDataPayload>,
): PreSearchDataPayload {
  return {
    queries: [
      {
        query: 'test search query',
        rationale: 'Test rationale',
        searchDepth: 'basic',
        index: 0,
        total: 1,
      },
    ],
    results: [
      {
        query: 'test search query',
        answer: 'Test answer from search',
        results: [
          {
            title: 'Test Result',
            url: 'https://example.com',
            content: 'Test content snippet',
          },
        ],
        responseTime: 500,
      },
    ],
    analysis: 'Test analysis summary',
    successCount: 1,
    failureCount: 0,
    totalResults: 1,
    totalTime: 500,
    ...overrides,
  };
}

/**
 * Create mock ModeratorAnalysisPayload with all required fields
 * Matches the NEW Multi-AI Deliberation Framework schema structure
 *
 * Schema includes:
 * - roundConfidence: Overall confidence score (0-100)
 * - confidenceWeighting: Weighting method (balanced, evidence_heavy, etc.)
 * - consensusEvolution: 5 debate phases with percentages
 * - summary: High-level insights text
 * - recommendations: Actionable items with title/description
 * - contributorPerspectives: Per-model analysis with scorecard, stance, evidence, vote
 * - consensusAnalysis: Alignment summary, heatmap, argument strength profile
 * - evidenceAndReasoning: Reasoning threads and evidence coverage
 * - alternatives: Alternative scenarios with confidence
 * - roundSummary: Participation stats, themes, unresolved questions
 */
export function createMockAnalysisPayload(
  roundNumber = 0,
  overrides?: Partial<ModeratorAnalysisPayload>,
): ModeratorAnalysisPayload {
  return {
    // Required fields per schema
    roundNumber,
    mode: ChatModes.DEBATING,
    userQuestion: `Test question for round ${roundNumber}`,
    // Optional fields
    roundConfidence: 78,
    confidenceWeighting: ConfidenceWeightings.BALANCED,
    consensusEvolution: [
      { phase: DebatePhases.OPENING, percentage: 32, label: 'Opening' },
      { phase: DebatePhases.REBUTTAL, percentage: 58, label: 'Rebuttal' },
      { phase: DebatePhases.CROSS_EXAM, percentage: 65, label: 'Cross-Exam' },
      { phase: DebatePhases.SYNTHESIS, percentage: 72, label: 'Synthesis' },
      { phase: DebatePhases.FINAL_VOTE, percentage: 78, label: 'Final Vote' },
    ],
    summary: 'Good discussion overall with solid reasoning and evidence from all contributors.',
    recommendations: [
      {
        title: 'Expand market research',
        description: 'Consider broader competitive analysis to validate assumptions',
      },
      {
        title: 'Review risk factors',
        description: 'Address identified concerns about timeline feasibility',
      },
    ],
    contributorPerspectives: [
      {
        participantIndex: 0,
        role: 'Analyst',
        modelId: 'openai/gpt-4',
        modelName: 'GPT-4',
        scorecard: {
          logic: 85,
          riskAwareness: 75,
          creativity: 70,
          evidence: 80,
          consensus: 75,
        },
        stance: 'Strong support for the proposed approach with minor reservations about timing',
        evidence: ['Market data supports growth trajectory', 'Historical precedent exists'],
        vote: VoteTypes.APPROVE,
      },
    ],
    consensusAnalysis: {
      alignmentSummary: {
        totalClaims: 5,
        majorAlignment: 4,
        contestedClaims: 1,
        contestedClaimsList: [
          { claim: 'Timeline feasibility', status: 'contested' },
        ],
      },
      agreementHeatmap: [
        {
          claim: 'Market timing is critical',
          perspectives: { 'GPT-4': AgreementStatuses.AGREE },
        },
        {
          claim: 'Resources are sufficient',
          perspectives: { 'GPT-4': AgreementStatuses.CAUTION },
        },
      ],
      argumentStrengthProfile: {
        Analyst: {
          logic: 85,
          riskAwareness: 75,
          creativity: 70,
          evidence: 80,
          consensus: 75,
        },
      },
    },
    evidenceAndReasoning: {
      reasoningThreads: [
        {
          claim: 'Market timing matters',
          synthesis: 'Strong agreement on timing importance across all contributors',
        },
      ],
      evidenceCoverage: [
        { claim: 'Market timing', strength: EvidenceStrengths.STRONG, percentage: 85 },
        { claim: 'Resource allocation', strength: EvidenceStrengths.MODERATE, percentage: 65 },
      ],
    },
    alternatives: [
      {
        scenario: 'Delayed launch',
        confidence: 65,
      },
      {
        scenario: 'Phased rollout',
        confidence: 72,
      },
    ],
    roundSummary: {
      participation: {
        approved: 1,
        cautioned: 0,
        rejected: 0,
      },
      keyThemes: 'Strong alignment on market opportunity with debate on execution timeline',
      unresolvedQuestions: [
        'Competitive response timing',
        'Resource scaling strategy',
      ],
      generated: new Date().toISOString(),
    },
    ...overrides,
  };
}

// ============================================================================
// Type-Safe Part Extraction Helpers
// ============================================================================

/**
 * Type guard for text parts in UIMessage
 * Follows discriminated union pattern from type-inference-patterns.md
 */
export function isTextPart(part: { type: string }): part is { type: 'text'; text: string } {
  return part.type === 'text';
}

/**
 * Extract text from message parts safely without force casting
 * Returns the text content from the first text part, or empty string if none
 */
export function getMessageText(message: UIMessage): string {
  if (!message.parts || message.parts.length === 0) {
    return '';
  }

  const textPart = message.parts.find(isTextPart);
  return textPart?.text ?? '';
}

/**
 * Extract text from a specific part index
 * Returns empty string if the part doesn't exist or isn't a text part
 */
export function getPartText(message: UIMessage, index = 0): string {
  const part = message.parts?.[index];
  if (!part || !isTextPart(part)) {
    return '';
  }
  return part.text;
}
