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
// REALISTIC DEMO DATA - Startup Strategy Use Case
// ============================================================================

const DEMO_USER = {
  name: 'Sarah Chen',
  image: null,
};

const DEMO_USER_MESSAGE = {
  id: 'msg-demo-user',
  content: 'We\'re a B2B SaaS startup with $2M ARR considering whether to expand into enterprise sales or double down on our SMB motion. Our sales cycle is currently 14 days with an ACV of $8K. What factors should we consider and what would you recommend?',
};

const DEMO_PARTICIPANTS = [
  {
    modelId: 'anthropic/claude-sonnet-4',
    role: 'Strategic Analyst',
  },
  {
    modelId: 'openai/gpt-4.1',
    role: 'Growth Advisor',
  },
  {
    modelId: 'google/gemini-2.5-pro',
    role: 'Operations Expert',
  },
];

const DEMO_MESSAGES = [
  `This is a pivotal decision that will fundamentally shape your company's trajectory. Let me break down the key factors:

**Current State Analysis:**
Your 14-day sales cycle with $8K ACV suggests a healthy SMB motion. At $2M ARR, you likely have 250+ customers, which provides meaningful data for pattern recognition.

**Enterprise Considerations:**
- Sales cycles typically extend to 3-6 months
- ACV jumps to $50K-$200K range
- Requires dedicated sales engineers, legal review processes, and security certifications (SOC 2, HIPAA)
- Customer success becomes more relationship-driven

**SMB Scale Considerations:**
- Can you reduce CAC through product-led growth?
- Is your product sticky enough for upsells/expansions?
- What's your current NDR (Net Dollar Retention)?

**My recommendation:** Before choosing, audit your top 20 customers. If 5+ are asking for enterprise features and willing to pay 5x your current ACV, that's a strong signal to test enterprise. Otherwise, your fastest path to $10M ARR is likely perfecting your SMB flywheel.`,

  `Great framing from the strategic perspective. I want to add the **growth mechanics** angle:

**The Math That Matters:**
- SMB path: Need ~1,250 customers at $8K to hit $10M ARR
- Enterprise path: Need ~100-200 customers at $50K-$100K ACV

**What I'd optimize for:**

1. **Lead velocity rate (LVR)** - Are qualified leads growing month-over-month? If LVR is strong, SMB has momentum.

2. **Payback period** - Enterprise extends this significantly. Can you fund 6+ months of sales effort before seeing returns?

3. **Talent acquisition** - Enterprise sales requires experienced reps ($150K+ OTE) vs. SMB can often be closed by founders or junior AEs.

**Growth hack to consider:** Instead of full enterprise motion, try "Enterprise Lite" - target mid-market companies (500-2000 employees) with a $25K ACV. You get 3x the revenue without the full enterprise complexity. Test this with 10 prospects before committing.

The companies that win long-term often start SMB, perfect their product, then **expand up-market with product-led signals** (power users at larger companies already using you).`,

  `Building on both perspectives, let me address the **operational readiness** you'll need:

**For Enterprise Expansion:**
- **Team structure:** You'll need at minimum: 1 Enterprise AE, 1 Sales Engineer, 1 dedicated CSM. Budget $400-500K/year fully loaded.
- **Product gaps:** Enterprise buyers expect SSO/SAML, audit logs, custom SLAs, dedicated support channels. Estimate 3-6 months of engineering focus.
- **Process changes:** Legal review cycles, procurement workflows, security questionnaires. Your current 14-day cycle will not survive first contact.

**For SMB Scale:**
- **Automation:** Invest in self-serve onboarding, in-app guidance, automated billing
- **Support model:** Move from 1:1 to 1:many through knowledge bases, community, webinars
- **Hiring:** Focus on SDRs and customer success associates vs. expensive enterprise talent

**My operational recommendation:**

Run a 90-day experiment. Identify 5 enterprise prospects from your existing customer base (larger companies using your product). Attempt a manual enterprise sale process. Track:
- Time to close
- Resources required
- Product gaps discovered
- Deal economics

This gives you real data instead of speculation. If the experiment succeeds, you have proof points to raise capital for enterprise expansion. If it fails, you've validated doubling down on SMB without burning 12+ months.

**One warning:** Trying to do both simultaneously at your stage is the most common way startups stall. Pick one, execute relentlessly, then expand.`,
];

// ============================================================================
// STAGES - Module-level completion tracking to prevent reset
// ============================================================================

type Stage = 'idle' | 'user-message' | 'participant-0-streaming' | 'participant-0-complete' | 'participant-1-streaming' | 'participant-1-complete' | 'participant-2-streaming' | 'complete';

// Module-level flag to track if demo has completed (persists across remounts)
let hasCompletedOnce = false;

// Helper to get initial state based on completion status
function getInitialStage(): Stage {
  return hasCompletedOnce ? 'complete' : 'idle';
}

function getInitialStreamingText(): string[] {
  return hasCompletedOnce ? [...DEMO_MESSAGES] : ['', '', ''];
}

export function LiveChatDemo() {
  // If already completed, start at complete stage with full text
  const [stage, setStage] = useState<Stage>(getInitialStage);
  const [streamingText, setStreamingText] = useState(getInitialStreamingText);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const intervalsRef = useRef<NodeJS.Timeout[]>([]);

  // Ref-stable setter to avoid lint false positive in animation callback
  const updateStreamingText = useRef(setStreamingText).current;

  // Cleanup on unmount
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    const intervals = intervalsRef.current;
    return () => {
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
    };
  }, []);

  // Mark as completed when reaching final stage
  useEffect(() => {
    if (stage === 'complete' && !hasCompletedOnce) {
      hasCompletedOnce = true;
    }
  }, [stage]);

  // Stage progression
  useEffect(() => {
    // Already completed - don't run any timers
    if (hasCompletedOnce) {
      return;
    }

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
    // Stay at 'complete' forever - never reset

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [stage]);

  // Generic typing animation for participants
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
      if (completionTimeout) {
        clearTimeout(completionTimeout);
      }
    };
  }, [updateStreamingText]);

  // Participant 0 streaming
  useEffect(() => {
    if (stage !== 'participant-0-streaming') {
      return;
    }
    return animateParticipant(0, () => setStage('participant-0-complete'));
  }, [stage, animateParticipant]);

  // Participant 1 streaming
  useEffect(() => {
    if (stage !== 'participant-1-streaming') {
      return;
    }
    return animateParticipant(1, () => setStage('participant-1-complete'));
  }, [stage, animateParticipant]);

  // Participant 2 streaming
  useEffect(() => {
    if (stage !== 'participant-2-streaming') {
      return;
    }
    return animateParticipant(2, () => setStage('complete'));
  }, [stage, animateParticipant]);

  const isStreaming = stage.includes('streaming');

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
      <ScrollArea className="h-full min-h-0 flex-1">
        <div className="w-full px-4 sm:px-6 pt-6 pb-6">
          {stage !== 'idle' && (
            <ThreadTimeline
              timelineItems={timelineItems}
              user={DEMO_USER}
              participants={storeParticipants}
              threadId="demo-thread"
              isStreaming={isStreaming}
              currentParticipantIndex={currentStreamingIndex ?? 0}
              currentStreamingParticipant={
                currentStreamingIndex !== null ? storeParticipants[currentStreamingIndex] ?? null : null
              }
              streamingRoundNumber={1}
              preSearches={[]}
              isReadOnly={true}
              maxContentHeight={280}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
