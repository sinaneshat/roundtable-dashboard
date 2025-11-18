'use client';

import type { UIMessage } from 'ai';
import { AnimatePresence, motion } from 'framer-motion';
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

type StreamingStage
  = | 'idle'
    | 'user-message'
    | 'pre-search-start'
    | 'pre-search-complete'
    | 'participant-0'
    | 'participant-1'
    | 'participant-2'
    | 'participants-complete'
    | 'analysis-start'
    | 'analysis-complete';

/**
 * Mock streaming showcase using EXACT chat components
 * Simulates: user message → pre-search → participants → analysis
 * Matches ChatThreadScreen structure exactly
 */
export function ChatShowcaseLive() {
  const [stage, setStage] = useState<StreamingStage>('idle');
  const [streamingText, setStreamingText] = useState<Record<string, string>>({});
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

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

    if (stage === 'idle') {
      timeout = setTimeout(() => setStage('user-message'), 500);
    } else if (stage === 'user-message') {
      timeout = setTimeout(() => setStage('pre-search-start'), 1000);
    } else if (stage === 'pre-search-start') {
      timeout = setTimeout(() => setStage('pre-search-complete'), 2500);
    } else if (stage === 'pre-search-complete') {
      timeout = setTimeout(() => setStage('participant-0'), 500);
    } else if (stage === 'participants-complete') {
      timeout = setTimeout(() => setStage('analysis-start'), 800);
    } else if (stage === 'analysis-start') {
      timeout = setTimeout(() => setStage('analysis-complete'), 2000);
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
    const participantStages: StreamingStage[] = ['participant-0', 'participant-1', 'participant-2'];
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
            setStage('participants-complete');
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
    if (stage !== 'idle') {
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
    const participantStages: StreamingStage[] = ['participant-0', 'participant-1', 'participant-2'];
    const currentParticipantIndex = participantStages.indexOf(stage);

    const completedCount = currentParticipantIndex >= 0
      ? currentParticipantIndex + 1
      : (
          stage === 'participants-complete'
          || stage === 'analysis-start'
          || stage === 'analysis-complete'
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

    // Show analysis when complete
    if (stage === 'analysis-complete') {
      items.push({
        type: 'analysis',
        data: MOCK_ANALYSIS,
        key: 'round-1-analysis',
        roundNumber: 1,
      });
    }

    return items;
  }, [stage, streamingText]);

  // Determine which participant is currently streaming
  const currentParticipantIndex = useMemo(() => {
    if (stage === 'participant-0')
      return 0;
    if (stage === 'participant-1')
      return 1;
    if (stage === 'participant-2')
      return 2;
    return -1;
  }, [stage]);

  const isStreaming = currentParticipantIndex >= 0;
  const currentStreamingParticipant = isStreaming ? MOCK_PARTICIPANTS[currentParticipantIndex] : null;

  // Show pre-search based on stage
  const preSearchStatus = useMemo(() => {
    if (stage === 'idle' || stage === 'user-message')
      return null;
    if (stage === 'pre-search-start')
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
  const showLoader = stage === 'pre-search-complete' && !isStreaming;

  // Exactly match ChatThreadScreen structure
  return (
    <div className="container max-w-3xl mx-auto px-2 sm:px-4 md:px-6 pt-6 pb-[240px] flex-1">
      <AnimatePresence mode="wait">
        <motion.div
          key={`stage-${stage}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{
            duration: 0.4,
            ease: [0.4, 0, 0.2, 1],
          }}
        >
          <ThreadTimeline
            timelineItems={timelineItems}
            scrollContainerId="chat-scroll-container"
            user={MOCK_USER}
            participants={MOCK_PARTICIPANTS.map((p, idx) => ({
              id: `participant-${idx}`,
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
                  id: `participant-${currentParticipantIndex}`,
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
          />

          {showLoader && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="mt-8 sm:mt-12"
            >
              <StreamingParticipantsLoader
                participants={MOCK_PARTICIPANTS.map((p, idx) => ({
                  id: `participant-${idx}`,
                  modelId: p.modelId,
                  role: p.role,
                  priority: idx,
                }))}
                currentParticipantIndex={0}
              />
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
