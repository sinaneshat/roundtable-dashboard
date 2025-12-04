'use client';

import type { UIMessage } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';

import { AnalysisStatuses, MessagePartTypes, MessageRoles } from '@/api/core/enums';
import { StreamingParticipantsLoader } from '@/components/chat/streaming-participants-loader';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
import type { TimelineItem } from '@/hooks/utils/useThreadTimeline';

import {
  MOCK_ANALYSIS,
  MOCK_PARTICIPANT_MESSAGES,
  MOCK_PARTICIPANTS,
  MOCK_PRE_SEARCH,
  MOCK_USER,
  MOCK_USER_MESSAGE,
} from './chat-showcase-data';

// ============================================================================
// Streaming Stage Enum (Local UI State Pattern)
// ============================================================================
// Following enum pattern from /docs/type-inference-patterns.md
// This is UI-only state, so simplified pattern (no Zod validation needed)

/** Type-safe enum constants for stage comparisons */
const StreamingStages = {
  IDLE: 'idle',
  USER_MESSAGE: 'user-message',
  PRE_SEARCH_START: 'pre-search-start',
  PRE_SEARCH_COMPLETE: 'pre-search-complete',
  PARTICIPANT_0: 'participant-0',
  PARTICIPANT_1: 'participant-1',
  PARTICIPANT_2: 'participant-2',
  PARTICIPANTS_COMPLETE: 'participants-complete',
  ANALYSIS_START: 'analysis-start',
  ANALYSIS_COMPLETE: 'analysis-complete',
} as const;

type StreamingStage = typeof StreamingStages[keyof typeof StreamingStages];

/**
 * Mock streaming showcase using EXACT chat components
 * Simulates: user message → pre-search → participants → analysis
 * Matches ChatThreadScreen structure exactly
 */
export function ChatShowcaseLive() {
  const [stage, setStage] = useState<StreamingStage>(StreamingStages.IDLE);
  const [streamingText, setStreamingText] = useState<Record<string, string>>({});
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // Interactive accordion states - undefined means use component's internal state (interactive)
  // When complete, pass undefined to let accordions be fully interactive
  const [preSearchManualOpen, setPreSearchManualOpen] = useState<boolean | undefined>(undefined);
  const [analysisManualOpen, setAnalysisManualOpen] = useState<boolean | undefined>(undefined);

  // Reset manual states when demo restarts using queueMicrotask
  // Pattern follows AI SDK v5 best practice for state updates in effects
  useEffect(() => {
    if (stage === StreamingStages.IDLE) {
      queueMicrotask(() => {
        setPreSearchManualOpen(undefined);
        setAnalysisManualOpen(undefined);
      });
    }
  }, [stage]);

  // Clear all timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, []);

  // Auto-progression through stages
  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;

    if (stage === StreamingStages.IDLE) {
      timeout = setTimeout(() => setStage(StreamingStages.USER_MESSAGE), 500);
    } else if (stage === StreamingStages.USER_MESSAGE) {
      timeout = setTimeout(() => setStage(StreamingStages.PRE_SEARCH_START), 1000);
    } else if (stage === StreamingStages.PRE_SEARCH_START) {
      timeout = setTimeout(() => setStage(StreamingStages.PRE_SEARCH_COMPLETE), 2500);
    } else if (stage === StreamingStages.PRE_SEARCH_COMPLETE) {
      timeout = setTimeout(() => setStage(StreamingStages.PARTICIPANT_0), 500);
    } else if (stage === StreamingStages.PARTICIPANTS_COMPLETE) {
      timeout = setTimeout(() => setStage(StreamingStages.ANALYSIS_START), 800);
    } else if (stage === StreamingStages.ANALYSIS_START) {
      timeout = setTimeout(() => setStage(StreamingStages.ANALYSIS_COMPLETE), 2000);
    }

    if (timeout) {
      timeoutsRef.current.push(timeout);
    }

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [stage]);

  // Simulate text streaming for participants with typing effect
  useEffect(() => {
    const participantStages: StreamingStage[] = [
      StreamingStages.PARTICIPANT_0,
      StreamingStages.PARTICIPANT_1,
      StreamingStages.PARTICIPANT_2,
    ];
    const currentIndex = participantStages.indexOf(stage);

    if (currentIndex === -1)
      return;

    const message = MOCK_PARTICIPANT_MESSAGES[currentIndex];
    if (!message)
      return;

    const part = message.parts[0];
    if (!part || part.type !== MessagePartTypes.TEXT)
      return;

    const fullText = part.text;
    const key = `participant-${currentIndex}`;
    let charIndex = 0;
    let intervalId: NodeJS.Timeout | null = null;
    let stageTransitionTimeout: NodeJS.Timeout | null = null;

    // Character-by-character typing effect
    intervalId = setInterval(() => {
      if (charIndex < fullText.length) {
        // Type 1-3 characters at a time for more realistic streaming
        const charsToAdd = Math.floor(Math.random() * 3) + 1;
        charIndex = Math.min(charIndex + charsToAdd, fullText.length);

        setStreamingText(prev => ({
          ...prev,
          [key]: fullText.slice(0, charIndex),
        }));
      } else {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        // Move to next stage after typing completes
        stageTransitionTimeout = setTimeout(() => {
          if (currentIndex < 2) {
            setStage(participantStages[currentIndex + 1]!);
          } else {
            setStage(StreamingStages.PARTICIPANTS_COMPLETE);
          }
        }, 800);
        timeoutsRef.current.push(stageTransitionTimeout);
      }
    }, 15); // Faster interval for character-by-character effect

    return () => {
      // Clear interval if still running
      if (intervalId) {
        clearInterval(intervalId);
      }
      // Clear stage transition timeout if it was set
      if (stageTransitionTimeout) {
        clearTimeout(stageTransitionTimeout);
      }
    };
  }, [stage]);

  // Build timeline items based on current stage
  const timelineItems = useMemo((): TimelineItem[] => {
    const items: TimelineItem[] = [];

    // Always show user message after idle
    if (stage !== StreamingStages.IDLE) {
      const userMessage: UIMessage = {
        id: MOCK_USER_MESSAGE.id,
        role: MessageRoles.USER,
        parts: [{
          type: 'text',
          text: MOCK_USER_MESSAGE.content,
        }],
        metadata: MOCK_USER_MESSAGE.metadata,
      };

      items.push({
        type: 'messages',
        data: [userMessage],
        key: 'round-1-messages-user',
        roundNumber: 1,
      });
    }

    // Show completed participant messages
    const participantStages: StreamingStage[] = [
      StreamingStages.PARTICIPANT_0,
      StreamingStages.PARTICIPANT_1,
      StreamingStages.PARTICIPANT_2,
    ];
    const currentParticipantIndex = participantStages.indexOf(stage);

    const completedCount = currentParticipantIndex >= 0
      ? currentParticipantIndex + 1
      : (
          stage === StreamingStages.PARTICIPANTS_COMPLETE
          || stage === StreamingStages.ANALYSIS_START
          || stage === StreamingStages.ANALYSIS_COMPLETE
        )
          ? 3
          : 0;

    const assistantMessages: UIMessage[] = [];

    for (let i = 0; i < completedCount; i++) {
      const mockMsg = MOCK_PARTICIPANT_MESSAGES[i];
      if (!mockMsg)
        continue;

      const isCurrentlyStreaming = i === currentParticipantIndex;
      const streamedText = streamingText[`participant-${i}`];

      // Convert to AI SDK UIMessage parts format
      const uiParts: Array<{ type: 'text'; text: string }> = (
        isCurrentlyStreaming
        && streamedText
      )
        ? [{ type: 'text', text: streamedText }]
        : mockMsg.parts.map((p) => {
            if (p.type === MessagePartTypes.TEXT) {
              return { type: 'text' as const, text: p.text };
            }
            return { type: 'text' as const, text: '' };
          }).filter(p => p.text);

      const uiMessage: UIMessage = {
        id: mockMsg.id,
        role: MessageRoles.ASSISTANT,
        parts: uiParts,
        metadata: {
          ...mockMsg.metadata,
          status: mockMsg.status,
          participantIndex: i,
          model: MOCK_PARTICIPANTS[i]?.modelId,
        },
      };

      assistantMessages.push(uiMessage);
    }

    if (assistantMessages.length > 0) {
      items.push({
        type: 'messages',
        data: assistantMessages,
        key: 'round-1-messages-assistants',
        roundNumber: 1,
      });
    }

    // Show analysis during analysis stages
    // Always use COMPLETE status with full data - no streaming needed
    if (stage === StreamingStages.ANALYSIS_START || stage === StreamingStages.ANALYSIS_COMPLETE) {
      items.push({
        type: 'analysis',
        data: MOCK_ANALYSIS, // Always has COMPLETE status and full data
        key: 'round-1-analysis',
        roundNumber: 1,
      });
    }

    return items;
  }, [stage, streamingText]);

  // Determine which participant is currently streaming
  const currentParticipantIndex = useMemo(() => {
    if (stage === StreamingStages.PARTICIPANT_0)
      return 0;
    if (stage === StreamingStages.PARTICIPANT_1)
      return 1;
    if (stage === StreamingStages.PARTICIPANT_2)
      return 2;
    return -1;
  }, [stage]);

  const isStreaming = currentParticipantIndex >= 0;
  const currentStreamingParticipant = isStreaming ? MOCK_PARTICIPANTS[currentParticipantIndex] : null;

  // Show pre-search based on stage
  const preSearchStatus = useMemo(() => {
    if (stage === StreamingStages.IDLE || stage === StreamingStages.USER_MESSAGE)
      return null;
    if (stage === StreamingStages.PRE_SEARCH_START)
      return AnalysisStatuses.STREAMING;
    return AnalysisStatuses.COMPLETE;
  }, [stage]);

  const preSearches = useMemo(() => {
    if (!preSearchStatus)
      return [];

    return [{
      ...MOCK_PRE_SEARCH,
      status: preSearchStatus,
    }];
  }, [preSearchStatus]);

  // Show loading indicator between stages
  const showLoader = stage === StreamingStages.PRE_SEARCH_COMPLETE && !isStreaming;

  // Simplified render without animation wrappers
  return (
    <div className="container max-w-3xl mx-auto px-2 sm:px-4 md:px-6 pt-6 pb-[140px] flex-1">
      <div>
        <ThreadTimeline
          timelineItems={timelineItems}
          scrollContainerId="main-scroll-container"
          user={MOCK_USER}
          participants={MOCK_PARTICIPANTS.map((p, idx) => ({
            id: `participant-demo-${idx}`,
            modelId: p.modelId,
            role: p.role,
            priority: idx,
            threadId: 'demo-thread',
            customRoleId: null,
            isEnabled: true,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }))}
          threadId="demo-thread"
          isStreaming={isStreaming}
          currentParticipantIndex={currentParticipantIndex}
          currentStreamingParticipant={currentStreamingParticipant
            ? {
                id: `participant-demo-${currentParticipantIndex}`,
                modelId: currentStreamingParticipant.modelId,
                role: currentStreamingParticipant.role,
                priority: currentParticipantIndex,
                threadId: 'demo-thread',
                customRoleId: null,
                isEnabled: true,
                settings: null,
                createdAt: new Date(),
                updatedAt: new Date(),
              }
            : null}
          streamingRoundNumber={1}
          feedbackByRound={new Map()}
          pendingFeedback={null}
          isReadOnly={true}
          preSearches={preSearches}
          onAnalysisStreamStart={() => {}}
          onAnalysisStreamComplete={() => {}}
          // Interactive accordions: expanded during streaming, stay open when complete
          // Pass undefined for full interactivity, or boolean for controlled state
          demoPreSearchOpen={
            stage === StreamingStages.ANALYSIS_COMPLETE
              ? (preSearchManualOpen ?? true) // Default open when complete, allow toggle
              : stage !== StreamingStages.IDLE && stage !== StreamingStages.USER_MESSAGE // Auto-open during streaming
          }
          demoAnalysisOpen={
            stage === StreamingStages.ANALYSIS_COMPLETE
              ? (analysisManualOpen ?? true) // Default open when complete, allow toggle
              : stage === StreamingStages.ANALYSIS_START // Open during analysis streaming
          }
        />
      </div>

      {showLoader && (
        <div className="mt-8 sm:mt-12">
          <StreamingParticipantsLoader
            participants={MOCK_PARTICIPANTS.map((p, idx) => ({
              id: `participant-${idx}`,
              modelId: p.modelId,
              role: p.role,
              priority: idx,
            }))}
            currentParticipantIndex={0}
          />
        </div>
      )}
    </div>
  );
}
