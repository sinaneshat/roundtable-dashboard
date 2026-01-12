'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* eslint-disable react-hooks-extra/no-direct-set-state-in-use-effect -- Animation demo requires setState in intervals/timeouts */
import {
  FinishReasons,
  MessagePartTypes,
  MessageRoles,
  ModelIds,
  MODERATOR_NAME,
  MODERATOR_PARTICIPANT_INDEX,
} from '@/api/core/enums';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ChatMessage, ChatParticipant } from '@/db/validation/chat';
import { useThreadTimeline } from '@/hooks/utils';
import { TYPING_CHARS_PER_FRAME, TYPING_FRAME_INTERVAL } from '@/lib/ui/animations';
import { chatMessagesToUIMessages } from '@/lib/utils';

const DEMO_USER = {
  name: 'Sarah Chen',
  image: null,
};

const DEMO_USER_MESSAGE_CONTENT = 'We\'re a B2B SaaS startup with $2M ARR considering enterprise expansion vs doubling down on SMB. Our sales cycle is 14 days with $8K ACV. What would you recommend?';

const DEMO_PARTICIPANTS_DATA = [
  { modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4, role: 'Strategic Analyst' },
  { modelId: ModelIds.OPENAI_GPT_4_1, role: 'Growth Advisor' },
  { modelId: ModelIds.GOOGLE_GEMINI_2_5_PRO, role: 'Operations Expert' },
];

const DEMO_MODERATOR_SYNTHESIS = `The council agrees on a staged approach: start with **Claude's customer audit**, then run **Gemini's 90-day experiment** before committing resources. **GPT's "Enterprise Lite"** mid-market option emerged as a potential middle path if the experiment shows promise.`;

const DEMO_RESPONSES = [
  `At $2M ARR with a 14-day sales cycle, your SMB motion is healthy. Before pivoting to enterprise, I'd audit your top 20 customers—if 5+ want enterprise features at 5x ACV, that's worth testing. **GPT, what does the growth math suggest?**`,

  `**Building on Claude's audit**—the math: SMB needs ~1,250 customers at $8K to hit $10M, while enterprise needs just 100-200 at $50K+. Consider "Enterprise Lite" at $25K ACV for 3x revenue without full complexity.`,

  `**I'd push back slightly** on jumping to enterprise without data. Run a 90-day experiment with 5 prospects from your existing base—that gives you real numbers on sales cycles and resources before committing.`,
];

const STATIC_PARTICIPANTS: ChatParticipant[] = DEMO_PARTICIPANTS_DATA.map((p, idx) => ({
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

const PARTICIPANT_CONTEXT = DEMO_PARTICIPANTS_DATA.map((p, idx) => ({
  id: `participant-${idx}`,
  modelId: p.modelId,
  role: p.role,
}));

function createUserMessage(): ChatMessage {
  return {
    id: 'msg-demo-user',
    threadId: 'demo-thread',
    participantId: null,
    role: MessageRoles.USER,
    parts: [{ type: MessagePartTypes.TEXT, text: DEMO_USER_MESSAGE_CONTENT }],
    toolCalls: null,
    roundNumber: 1,
    createdAt: new Date(),
    metadata: { role: MessageRoles.USER, roundNumber: 1 },
  };
}

function createParticipantMessage(index: number, text: string): ChatMessage {
  return {
    id: `msg-demo-participant-${index}`,
    threadId: 'demo-thread',
    participantId: `participant-${index}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    toolCalls: null,
    roundNumber: 1,
    createdAt: new Date(),
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber: 1,
      participantId: `participant-${index}`,
      participantIndex: index,
      participantRole: DEMO_PARTICIPANTS_DATA[index]?.role ?? null,
      model: DEMO_PARTICIPANTS_DATA[index]?.modelId ?? '',
      finishReason: FinishReasons.STOP,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
    },
  };
}

function createModeratorMessage(text: string): ChatMessage {
  return {
    id: 'msg-demo-moderator',
    threadId: 'demo-thread',
    participantId: null,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    toolCalls: null,
    roundNumber: 1,
    createdAt: new Date(),
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber: 1,
      isModerator: true,
      participantIndex: MODERATOR_PARTICIPANT_INDEX,
      model: MODERATOR_NAME,
      finishReason: FinishReasons.STOP,
      hasError: false,
    },
  };
}

export function LiveChatDemo() {
  const [activeParticipant, setActiveParticipant] = useState(-1);
  const [streamedText, setStreamedText] = useState(['', '', '']);
  const [moderatorText, setModeratorText] = useState('');
  const [demoCompleted, setDemoCompleted] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Demo animation: intentional setState in intervals/timeouts triggered by useEffect

  useEffect(() => {
    if (activeParticipant >= 4 && !demoCompleted) {
      setDemoCompleted(true);
    }
  }, [activeParticipant, demoCompleted]);

  useEffect(() => {
    if (demoCompleted) {
      return;
    }

    const timeout = setTimeout(() => {
      setActiveParticipant(0);
    }, 500);

    return () => clearTimeout(timeout);
  }, [demoCompleted]);

  const runAnimation = useCallback((index: number) => {
    const isModerator = index === 3;
    const fullText = isModerator ? DEMO_MODERATOR_SYNTHESIS : (DEMO_RESPONSES[index] || '');
    let charIndex = 0;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      charIndex += TYPING_CHARS_PER_FRAME;

      if (charIndex >= fullText.length) {
        charIndex = fullText.length;
        if (isModerator) {
          setModeratorText(fullText);
        } else {
          setStreamedText((prev) => {
            const next = [...prev];
            next[index] = fullText;
            return next;
          });
        }

        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        setTimeout(() => {
          setActiveParticipant(index + 1);
        }, 300);
      } else {
        if (isModerator) {
          setModeratorText(fullText.slice(0, charIndex));
        } else {
          setStreamedText((prev) => {
            const next = [...prev];
            next[index] = fullText.slice(0, charIndex);
            return next;
          });
        }
      }
    }, TYPING_FRAME_INTERVAL);
  }, []);

  useEffect(() => {
    if (activeParticipant >= 0 && activeParticipant <= 3) {
      runAnimation(activeParticipant);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeParticipant, runAnimation]);

  const messages: ChatMessage[] = [createUserMessage()];

  if (activeParticipant >= 4) {
    for (let i = 0; i < 3; i++) {
      messages.push(createParticipantMessage(i, DEMO_RESPONSES[i] || ''));
    }
    messages.push(createModeratorMessage(DEMO_MODERATOR_SYNTHESIS));
  } else if (activeParticipant === 3) {
    for (let i = 0; i < 3; i++) {
      messages.push(createParticipantMessage(i, DEMO_RESPONSES[i] || ''));
    }
    if (moderatorText) {
      messages.push(createModeratorMessage(moderatorText));
    }
  } else {
    for (let i = 0; i < 3; i++) {
      if (activeParticipant > i) {
        messages.push(createParticipantMessage(i, DEMO_RESPONSES[i] || ''));
      } else if (activeParticipant === i) {
        messages.push(createParticipantMessage(i, streamedText[i] || ''));
      }
    }
  }

  const uiMessages = chatMessagesToUIMessages(messages, PARTICIPANT_CONTEXT);
  const timelineItems = useThreadTimeline({
    messages: uiMessages,
    changelog: [],
  });

  // Streaming states for pending cards system
  const isParticipantStreaming = activeParticipant >= 0 && activeParticipant <= 2;
  const isModeratorStreaming = activeParticipant === 3;
  const isDemoActive = activeParticipant >= 0 && activeParticipant <= 3;

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <ScrollArea className="h-full">
        <div className="w-full px-10 py-6 [&_p]:text-muted-foreground [&_strong]:text-foreground">
          <ThreadTimeline
            timelineItems={timelineItems}
            user={DEMO_USER}
            participants={STATIC_PARTICIPANTS}
            threadId="demo-thread"
            isStreaming={isParticipantStreaming}
            currentParticipantIndex={isParticipantStreaming ? activeParticipant : 0}
            currentStreamingParticipant={isParticipantStreaming ? STATIC_PARTICIPANTS[activeParticipant] ?? null : null}
            streamingRoundNumber={isDemoActive ? 1 : null}
            preSearches={[]}
            isReadOnly={true}
            skipEntranceAnimations={false}
            demoMode={true}
            isModeratorStreaming={isModeratorStreaming}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
