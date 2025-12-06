'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { MessagePartTypes } from '@/api/core/enums';
import type { ChatMessage, ChatParticipant } from '@/api/routes/chat/schema';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useThreadTimeline } from '@/hooks/utils';
import { TYPING_CHARS_PER_FRAME, TYPING_FRAME_INTERVAL } from '@/lib/ui/animations';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';

// ============================================================================
// SIMPLIFIED DEMO DATA
// ============================================================================

const DEMO_USER = {
  name: 'Demo User',
  image: null,
};

const DEMO_USER_MESSAGE = {
  id: 'msg-demo-user',
  content: 'What makes a great product launch strategy?',
};

const DEMO_PARTICIPANTS = [
  {
    modelId: 'anthropic/claude-sonnet-4',
    role: 'Strategic Analyst',
  },
  {
    modelId: 'openai/gpt-4.1',
    role: 'Creative Director',
  },
  {
    modelId: 'google/gemini-2.5-pro',
    role: 'Market Expert',
  },
];

const DEMO_MESSAGES = [
  `A successful launch needs three pillars: **timing**, **messaging**, and **momentum**.

Start with a soft launch to gather feedback, then build anticipation through strategic teasers before the main reveal.`,
  `I'd focus on the **storytelling** angle. Your launch should answer "why now?" and "why does this matter?"

Create an emotional hook that resonates with your audience's aspirations, not just their needs.`,
  `From a market perspective, **competitive positioning** is key.

Identify your unique differentiator and ensure every touchpoint - from landing page to social posts - reinforces that single compelling message.`,
];

// ============================================================================
// SIMPLIFIED STAGES
// ============================================================================

type Stage
  = | 'idle'
    | 'user-message'
    | 'participant-0-streaming'
    | 'participant-0-complete'
    | 'participant-1-streaming'
    | 'participant-1-complete'
    | 'participant-2-streaming'
    | 'complete';

export function LiveChatDemo() {
  const [stage, setStage] = useState<Stage>('idle');
  const [streamingText, setStreamingText] = useState(['', '', '']);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const intervalsRef = useRef<NodeJS.Timeout[]>([]);

  // Ref-stable setter to avoid lint false positive in animation callback
  const updateStreamingText = useRef(setStreamingText).current;

  // Scroll tracking
  const isAtBottomRef = useRef(true);
  const isProgrammaticScrollRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    const intervals = intervalsRef.current;
    return () => {
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
  }, []);

  // Stage progression
  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined;

    if (stage === 'idle') {
      timeout = setTimeout(() => setStage('user-message'), 600);
    } else if (stage === 'user-message') {
      timeout = setTimeout(() => setStage('participant-0-streaming'), 800);
    } else if (stage === 'participant-0-complete') {
      timeout = setTimeout(() => setStage('participant-1-streaming'), 400);
    } else if (stage === 'participant-1-complete') {
      timeout = setTimeout(() => setStage('participant-2-streaming'), 400);
    }
    // Stay at 'complete' - no looping

    return () => {
      if (timeout)
        clearTimeout(timeout);
    };
  }, [stage]);

  // Generic typing animation for participants
  // Note: setStreamingText is called inside setInterval callback, not directly in effect
  const animateParticipant = useCallback((index: number, onComplete: () => void) => {
    const fullText = DEMO_MESSAGES[index] || '';
    let charIndex = 0;
    let completionTimeout: NodeJS.Timeout | undefined;

    const interval = setInterval(() => {
      if (charIndex < fullText.length) {
        charIndex = Math.min(charIndex + TYPING_CHARS_PER_FRAME, fullText.length);
        updateStreamingText((prev) => {
          const next = [...prev];
          next[index] = fullText.slice(0, charIndex);
          return next;
        });
      } else {
        clearInterval(interval);
        completionTimeout = setTimeout(onComplete, 300);
      }
    }, TYPING_FRAME_INTERVAL);

    intervalsRef.current.push(interval);
    return () => {
      clearInterval(interval);
      if (completionTimeout)
        clearTimeout(completionTimeout);
    };
  }, [updateStreamingText]);

  // Participant 0 streaming
  useEffect(() => {
    if (stage !== 'participant-0-streaming')
      return;
    return animateParticipant(0, () => setStage('participant-0-complete'));
  }, [stage, animateParticipant]);

  // Participant 1 streaming
  useEffect(() => {
    if (stage !== 'participant-1-streaming')
      return;
    return animateParticipant(1, () => setStage('participant-1-complete'));
  }, [stage, animateParticipant]);

  // Participant 2 streaming
  useEffect(() => {
    if (stage !== 'participant-2-streaming')
      return;
    return animateParticipant(2, () => setStage('complete'));
  }, [stage, animateParticipant]);

  // Scroll helpers
  const getViewportElement = useCallback(() => {
    const root = scrollContainerRef.current;
    if (!root)
      return null;
    return root.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const viewport = getViewportElement();
    if (!scrollAnchorRef.current || !viewport)
      return;

    isProgrammaticScrollRef.current = true;
    requestAnimationFrame(() => {
      scrollAnchorRef.current?.scrollIntoView({ behavior, block: 'end' });
      isAtBottomRef.current = true;
      setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, behavior === 'smooth' ? 300 : 50);
    });
  }, [getViewportElement]);

  // Auto-scroll during streaming
  const isStreaming = stage.includes('streaming');
  useEffect(() => {
    const viewport = getViewportElement();
    if (!viewport || !isStreaming)
      return;

    const observer = new MutationObserver(() => {
      if (isAtBottomRef.current && !isProgrammaticScrollRef.current) {
        requestAnimationFrame(() => scrollToBottom('auto'));
      }
    });

    observer.observe(viewport, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [isStreaming, scrollToBottom, getViewportElement]);

  // Scroll on stage change
  useEffect(() => {
    if (isAtBottomRef.current) {
      requestAnimationFrame(() => scrollToBottom('smooth'));
    }
  }, [stage, scrollToBottom]);

  // Build messages
  const messages: ChatMessage[] = [];

  // User message
  if (stage !== 'idle') {
    messages.push({
      id: DEMO_USER_MESSAGE.id,
      threadId: 'demo-thread',
      participantId: null,
      role: 'user',
      parts: [{ type: 'text', text: DEMO_USER_MESSAGE.content }],
      roundNumber: 1,
      createdAt: new Date(),
      metadata: { role: 'user', roundNumber: 1 },
    });
  }

  // Participant messages
  const participantStageOrder: Stage[] = [
    'participant-0-streaming',
    'participant-0-complete',
    'participant-1-streaming',
    'participant-1-complete',
    'participant-2-streaming',
    'complete',
  ];

  const currentStageIndex = participantStageOrder.indexOf(stage);

  if (currentStageIndex >= 0) {
    for (let i = 0; i < 3; i++) {
      const streamingStage = `participant-${i}-streaming` as Stage;
      const completeStage = i === 2 ? 'complete' : `participant-${i}-complete` as Stage;

      const streamingIndex = participantStageOrder.indexOf(streamingStage);
      const completeIndex = participantStageOrder.indexOf(completeStage);

      // Show if we've reached streaming stage
      if (currentStageIndex >= streamingIndex) {
        const isCurrentlyStreaming = stage === streamingStage;
        const isComplete = currentStageIndex >= completeIndex;

        const text = isCurrentlyStreaming
          ? (streamingText[i] ?? '')
          : isComplete
            ? (DEMO_MESSAGES[i] ?? '')
            : '';

        messages.push({
          id: `msg-demo-participant-${i}`,
          threadId: 'demo-thread',
          participantId: `participant-${i}`,
          role: 'assistant',
          parts: [{ type: MessagePartTypes.TEXT, text }],
          roundNumber: 1,
          createdAt: new Date(),
          metadata: {
            role: 'assistant' as const,
            roundNumber: 1,
            participantId: `participant-${i}`,
            participantIndex: i,
            participantRole: DEMO_PARTICIPANTS[i]?.role ?? null,
            model: DEMO_PARTICIPANTS[i]?.modelId ?? '',
            finishReason: 'stop' as const,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            hasError: false,
            isTransient: false,
            isPartialResponse: false,
          },
        });
      }
    }
  }

  // Build store participants
  const storeParticipants: ChatParticipant[] = DEMO_PARTICIPANTS.map((p, idx) => ({
    id: `participant-${idx}`,
    threadId: 'demo-thread',
    modelId: p.modelId,
    customRoleId: null,
    role: p.role,
    priority: idx,
    isEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    settings: null,
  }));

  // Convert to timeline
  const participantContext = DEMO_PARTICIPANTS.map((p, idx) => ({
    id: `participant-${idx}`,
    modelId: p.modelId,
    role: p.role,
  }));

  const uiMessages = chatMessagesToUIMessages(messages, participantContext);
  const timelineItems = useThreadTimeline({
    messages: uiMessages,
    analyses: [],
    changelog: [],
  });

  // Current streaming participant
  const currentStreamingIndex = stage === 'participant-0-streaming'
    ? 0
    : stage === 'participant-1-streaming'
      ? 1
      : stage === 'participant-2-streaming'
        ? 2
        : null;

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      <ScrollArea className="h-full min-h-0 flex-1" ref={scrollContainerRef}>
        <div className="w-full px-4 sm:px-6 pt-6 pb-6">
          {stage !== 'idle' && (
            <ThreadTimeline
              timelineItems={timelineItems}
              scrollContainerId="demo-scroll-container"
              user={DEMO_USER}
              participants={storeParticipants}
              threadId="demo-thread"
              isStreaming={isStreaming || stage !== 'complete'}
              currentParticipantIndex={currentStreamingIndex ?? 0}
              currentStreamingParticipant={
                currentStreamingIndex !== null ? storeParticipants[currentStreamingIndex] ?? null : null
              }
              streamingRoundNumber={1}
              preSearches={[]}
              isReadOnly={true}
            />
          )}
          <div
            ref={scrollAnchorRef}
            aria-hidden="true"
            className="h-px w-full"
          />
        </div>
      </ScrollArea>
    </div>
  );
}
