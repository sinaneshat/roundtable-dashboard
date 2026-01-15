'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Streamdown } from 'streamdown';

/* eslint-disable react-hooks-extra/no-direct-set-state-in-use-effect -- Animation demo requires setState in intervals/timeouts */
import { MessageRoles, ModelIds, MODERATOR_NAME } from '@/api/core/enums';
import { ParticipantHeader } from '@/components/chat/participant-header';
import { streamdownComponents } from '@/components/markdown/unified-markdown-components';
import { ScrollArea } from '@/components/ui/scroll-area';
import { BRAND } from '@/constants/brand';
import { TYPING_CHARS_PER_FRAME, TYPING_FRAME_INTERVAL } from '@/lib/ui/animations';
import { cn } from '@/lib/ui/cn';
import { getAvatarPropsFromModelId } from '@/lib/utils/ai-display';

const DEMO_USER_MESSAGE = 'We\'re a B2B SaaS startup with $2M ARR considering enterprise expansion vs doubling down on SMB. Our sales cycle is 14 days with $8K ACV. What would you recommend?';

const DEMO_PARTICIPANT_CONFIG = [
  { modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4, role: 'Strategic Analyst' },
  { modelId: ModelIds.OPENAI_GPT_4_1, role: 'Growth Advisor' },
  { modelId: ModelIds.GOOGLE_GEMINI_2_5_PRO, role: 'Operations Expert' },
] as const;

const DEMO_RESPONSES = [
  `At $2M ARR with a 14-day sales cycle, your SMB motion is healthy. Before pivoting to enterprise, I'd audit your top 20 customers—if 5+ want enterprise features at 5x ACV, that's worth testing. **GPT, what does the growth math suggest?**`,
  `**Building on Claude's audit**—the math: SMB needs ~1,250 customers at $8K to hit $10M, while enterprise needs just 100-200 at $50K+. Consider "Enterprise Lite" at $25K ACV for 3x revenue without full complexity.`,
  `**I'd push back slightly** on jumping to enterprise without data. Run a 90-day experiment with 5 prospects from your existing base—that gives you real numbers on sales cycles and resources before committing.`,
];

const DEMO_MODERATOR = `The council agrees on a staged approach: start with **Claude's customer audit**, then run **Gemini's 90-day experiment** before committing resources. **GPT's "Enterprise Lite"** mid-market option emerged as a potential middle path if the experiment shows promise.`;

const UserMessage = memo(({ text }: { text: string }) => {
  return (
    <div className="flex flex-col items-end gap-2">
      <div
        dir="auto"
        className={cn(
          'max-w-[85%] ml-auto w-fit',
          'bg-secondary text-secondary-foreground',
          'rounded-2xl rounded-br-md px-4 py-3',
          'text-base leading-relaxed',
        )}
      >
        <Streamdown
          className="[&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
          components={streamdownComponents}
        >
          {text}
        </Streamdown>
      </div>
    </div>
  );
});

const ParticipantMessage = memo(({
  modelId,
  role,
  text,
  isStreaming,
}: {
  modelId: string;
  role: string;
  text: string;
  isStreaming: boolean;
}) => {
  const avatarProps = useMemo(
    () => getAvatarPropsFromModelId(MessageRoles.ASSISTANT, modelId),
    [modelId],
  );

  return (
    <div className="flex justify-start">
      <div className="w-full">
        <ParticipantHeader
          avatarSrc={avatarProps.src}
          avatarName={avatarProps.name}
          displayName={avatarProps.name}
          role={role}
          isStreaming={isStreaming}
        />
        {text && (
          <div dir="auto">
            <Streamdown
              className="text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              components={streamdownComponents}
            >
              {text}
            </Streamdown>
          </div>
        )}
      </div>
    </div>
  );
});

const ModeratorMessage = memo(({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) => {
  return (
    <div className="flex justify-start">
      <div className="w-full">
        <ParticipantHeader
          avatarSrc={BRAND.logos.main}
          avatarName={MODERATOR_NAME}
          displayName={MODERATOR_NAME}
          isStreaming={isStreaming}
        />
        {text && (
          <div dir="auto">
            <Streamdown
              className="text-foreground [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              components={streamdownComponents}
            >
              {text}
            </Streamdown>
          </div>
        )}
      </div>
    </div>
  );
});

export function LiveChatDemo() {
  const [activeIdx, setActiveIdx] = useState(-1);
  const [texts, setTexts] = useState(['', '', '', '']);
  const [isMounted, setIsMounted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted)
      return;
    const t = setTimeout(() => setActiveIdx(0), 500);
    return () => clearTimeout(t);
  }, [isMounted]);

  const runAnimation = useCallback((idx: number) => {
    const fullText = idx === 3 ? DEMO_MODERATOR : (DEMO_RESPONSES[idx] ?? '');
    let charIdx = 0;

    if (intervalRef.current)
      clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      charIdx += TYPING_CHARS_PER_FRAME;
      const newText = fullText.slice(0, Math.min(charIdx, fullText.length));

      setTexts((prev) => {
        const next = [...prev];
        next[idx] = newText;
        return next;
      });

      if (charIdx >= fullText.length) {
        if (intervalRef.current)
          clearInterval(intervalRef.current);
        intervalRef.current = null;
        setTimeout(() => {
          if (idx < 3)
            setActiveIdx(idx + 1);
        }, 400);
      }
    }, TYPING_FRAME_INTERVAL);
  }, []);

  useEffect(() => {
    if (!isMounted || activeIdx < 0 || activeIdx > 3)
      return;
    runAnimation(activeIdx);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isMounted, activeIdx, runAnimation]);

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <ScrollArea className="h-full">
        <div className="w-full px-6 py-6 space-y-14">
          <UserMessage text={DEMO_USER_MESSAGE} />

          {DEMO_PARTICIPANT_CONFIG.map((p, idx) => {
            if (activeIdx < idx)
              return null;
            const isActive = activeIdx === idx;
            const text = isActive ? texts[idx] : (activeIdx > idx ? DEMO_RESPONSES[idx] : '');

            return (
              <ParticipantMessage
                key={p.modelId}
                modelId={p.modelId}
                role={p.role}
                text={text ?? ''}
                isStreaming={isActive}
              />
            );
          })}

          {activeIdx >= 3 && (
            <ModeratorMessage
              text={texts[3] ?? ''}
              isStreaming={activeIdx === 3}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
