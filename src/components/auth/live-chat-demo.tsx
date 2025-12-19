'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { MessagePartTypes, MessageRoles } from '@/api/core/enums';
import type { ChatMessage, ChatParticipant } from '@/api/routes/chat/schema';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useThreadTimeline } from '@/hooks/utils';
import { TYPING_CHARS_PER_FRAME, TYPING_FRAME_INTERVAL } from '@/lib/ui/animations';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';

// ============================================================================
// DEMO DATA
// ============================================================================

const DEMO_USER = {
  name: 'Sarah Chen',
  image: null,
};

const DEMO_USER_MESSAGE_CONTENT = 'We\'re a B2B SaaS startup with $2M ARR considering whether to expand into enterprise sales or double down on our SMB motion. Our sales cycle is currently 14 days with an ACV of $8K. What factors should we consider and what would you recommend?';

const DEMO_PARTICIPANTS_DATA = [
  { modelId: 'anthropic/claude-sonnet-4', role: 'Strategic Analyst' },
  { modelId: 'openai/gpt-4.1', role: 'Growth Advisor' },
  { modelId: 'google/gemini-2.5-pro', role: 'Operations Expert' },
];

const DEMO_RESPONSES = [
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
// STATIC DATA FOR TIMELINE
// ============================================================================

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
    parts: [{ type: 'text', text: DEMO_USER_MESSAGE_CONTENT }],
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
    roundNumber: 1,
    createdAt: new Date(),
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber: 1,
      participantId: `participant-${index}`,
      participantIndex: index,
      participantRole: DEMO_PARTICIPANTS_DATA[index]?.role ?? null,
      model: DEMO_PARTICIPANTS_DATA[index]?.modelId ?? '',
      finishReason: 'stop' as const,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
    },
  };
}

// ============================================================================
// COMPONENT - Simplified, no completion tracking
// ============================================================================

// Module-level flag to track completion (persists across remounts)
let demoHasCompleted = false;

export function LiveChatDemo() {
  // -1 = waiting, 0/1/2 = streaming that participant, 3 = all done
  const [activeParticipant, setActiveParticipant] = useState(() => demoHasCompleted ? 3 : -1);
  const [streamedText, setStreamedText] = useState(() => demoHasCompleted ? [...DEMO_RESPONSES] : ['', '', '']);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Mark complete when animation finishes
  useEffect(() => {
    if (activeParticipant >= 3) {
      demoHasCompleted = true;
    }
  }, [activeParticipant]);

  // Start animation on mount - only if not already completed
  useEffect(() => {
    if (demoHasCompleted) {
      return;
    }

    const timeout = setTimeout(() => {
      setActiveParticipant(0);
    }, 500);

    return () => clearTimeout(timeout);
  }, []);

  // Animation function - setState calls are inside async callbacks (setInterval/setTimeout)
  const runAnimation = useCallback((index: number) => {
    const fullText = DEMO_RESPONSES[index] || '';
    let charIndex = 0;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      charIndex += TYPING_CHARS_PER_FRAME;

      if (charIndex >= fullText.length) {
        charIndex = fullText.length;
        // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Inside setInterval callback (async)
        setStreamedText((prev) => {
          const next = [...prev];
          next[index] = fullText;
          return next;
        });

        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        // Next participant after pause
        setTimeout(() => {
          // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Inside setTimeout callback (async)
          setActiveParticipant(index + 1);
        }, 300);
      } else {
        // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Inside setInterval callback (async)
        setStreamedText((prev) => {
          const next = [...prev];
          next[index] = fullText.slice(0, charIndex);
          return next;
        });
      }
    }, TYPING_FRAME_INTERVAL);
  }, []);

  // Trigger animation when activeParticipant changes
  useEffect(() => {
    if (activeParticipant >= 0 && activeParticipant < 3) {
      runAnimation(activeParticipant);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [activeParticipant, runAnimation]);

  // Build messages
  const messages: ChatMessage[] = [createUserMessage()];

  // All done - show all participants with full text
  if (activeParticipant >= 3) {
    for (let i = 0; i < 3; i++) {
      messages.push(createParticipantMessage(i, DEMO_RESPONSES[i] || ''));
    }
  } else {
    // Animation in progress
    for (let i = 0; i < 3; i++) {
      if (activeParticipant > i) {
        // This participant finished - full text
        messages.push(createParticipantMessage(i, DEMO_RESPONSES[i] || ''));
      } else if (activeParticipant === i) {
        // Currently streaming
        messages.push(createParticipantMessage(i, streamedText[i] || ''));
      }
      // else: not started yet, don't add
    }
  }

  const uiMessages = chatMessagesToUIMessages(messages, PARTICIPANT_CONTEXT);
  const timelineItems = useThreadTimeline({
    messages: uiMessages,
    summaries: [],
    changelog: [],
  });

  const isStreaming = activeParticipant >= 0 && activeParticipant < 3;

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      <ScrollArea className="h-full min-h-0 flex-1">
        <div className="w-full px-4 sm:px-6 pt-6 pb-6">
          <ThreadTimeline
            timelineItems={timelineItems}
            user={DEMO_USER}
            participants={STATIC_PARTICIPANTS}
            threadId="demo-thread"
            isStreaming={isStreaming}
            currentParticipantIndex={isStreaming ? activeParticipant : 0}
            currentStreamingParticipant={isStreaming ? STATIC_PARTICIPANTS[activeParticipant] ?? null : null}
            streamingRoundNumber={isStreaming ? 1 : null}
            preSearches={[]}
            isReadOnly={true}
            skipEntranceAnimations={false}
          />
        </div>
      </ScrollArea>
    </div>
  );
}
