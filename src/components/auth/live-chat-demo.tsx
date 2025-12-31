'use client';
/* eslint-disable react-hooks-extra/no-direct-set-state-in-use-effect -- Animation demo uses setInterval pattern */

import { useCallback, useEffect, useRef, useState } from 'react';

import { FinishReasons, MessagePartTypes, MessageRoles } from '@/api/core/enums';
import type { ChatMessage, ChatParticipant } from '@/api/routes/chat/schema';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useThreadTimeline } from '@/hooks/utils';
import { TYPING_CHARS_PER_FRAME, TYPING_FRAME_INTERVAL } from '@/lib/ui/animations';
import { chatMessagesToUIMessages } from '@/lib/utils';

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

const DEMO_MODERATOR_SUMMARY = `### Summary Conclusion

The council recommends a **staged approach**: run a 90-day enterprise experiment with 5 existing customers before committing to a full pivot.

---

### Key Strategic Factors

**Current Position:** $2M ARR, 14-day sales cycle, $8K ACV indicates a healthy SMB motion with ~250+ customers.

**Enterprise Trade-offs:**
- Sales cycles extend to 3-6 months
- ACV increases to $50K-$200K
- Requires significant infrastructure (SOC 2, legal, sales engineers)

**SMB Scale Path:**
- Need ~1,250 customers at current ACV to reach $10M
- Focus on product-led growth and automation
- Lower talent costs, faster iteration

---

### Areas of Agreement

All participants agreed on:
1. **Data-driven decision**: Audit top 20 customers before choosing
2. **Avoid splitting focus**: Doing both simultaneously is the most common way startups stall
3. **Mid-market option**: "Enterprise Lite" at $25K ACV offers a middle path

---

### Recommended Action

Run a controlled 90-day experiment with 5 enterprise prospects from your existing customer base. Track time-to-close, resources required, product gaps, and deal economics. This provides real data instead of speculation.

**Consensus Status:** Strong alignment on experimental approach before major strategic commitment.`;

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
    roundNumber: 1,
    createdAt: new Date(),
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber: 1,
      isModerator: true,
      participantIndex: -99,
      model: 'Council Moderator',
      finishReason: FinishReasons.STOP,
      hasError: false,
    },
  };
}

let demoHasCompleted = false;

export function LiveChatDemo() {
  const [activeParticipant, setActiveParticipant] = useState(() => demoHasCompleted ? 4 : -1);
  const [streamedText, setStreamedText] = useState(() => demoHasCompleted ? [...DEMO_RESPONSES] : ['', '', '']);
  const [moderatorText, setModeratorText] = useState(() => demoHasCompleted ? DEMO_MODERATOR_SUMMARY : '');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (activeParticipant >= 4) {
      demoHasCompleted = true;
    }
  }, [activeParticipant]);

  useEffect(() => {
    if (demoHasCompleted) {
      return;
    }

    const timeout = setTimeout(() => {
      setActiveParticipant(0);
    }, 500);

    return () => clearTimeout(timeout);
  }, []);

  const runAnimation = useCallback((index: number) => {
    const isModerator = index === 3;
    const fullText = isModerator ? DEMO_MODERATOR_SUMMARY : (DEMO_RESPONSES[index] || '');
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
    messages.push(createModeratorMessage(DEMO_MODERATOR_SUMMARY));
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

  // Streaming states - participants (0-2) vs moderator (3)
  const isParticipantStreaming = activeParticipant >= 0 && activeParticipant <= 2;
  const isModeratorStreaming = activeParticipant === 3;
  const isAnyStreaming = isParticipantStreaming || isModeratorStreaming;

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      <ScrollArea className="h-full min-h-0 flex-1">
        <div className="w-full px-4 sm:px-6 pt-6 pb-6">
          <ThreadTimeline
            timelineItems={timelineItems}
            user={DEMO_USER}
            participants={STATIC_PARTICIPANTS}
            threadId="demo-thread"
            isStreaming={isParticipantStreaming}
            currentParticipantIndex={isParticipantStreaming ? activeParticipant : 0}
            currentStreamingParticipant={isParticipantStreaming ? STATIC_PARTICIPANTS[activeParticipant] ?? null : null}
            streamingRoundNumber={isAnyStreaming ? 1 : null}
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
