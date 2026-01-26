/**
 * TypewriterTitle Component
 *
 * Renders sidebar thread title with typewriter animation when AI-generated title is ready.
 * Shows a blinking cursor during delete and type phases.
 */

import { useShallow } from 'zustand/react/shallow';

import { useChatStore } from '@/components/providers/chat-store-provider/context';

type TypewriterTitleProps = {
  threadId: string;
  currentTitle: string;
};

export function TypewriterTitle({ currentTitle, threadId }: TypewriterTitleProps) {
  const { animatingThreadId, animationPhase, displayedTitle } = useChatStore(
    useShallow(s => ({
      animatingThreadId: s.animatingThreadId,
      animationPhase: s.animationPhase,
      displayedTitle: s.displayedTitle,
    })),
  );

  // Not animating this thread - show current title
  if (animatingThreadId !== threadId) {
    return <span>{currentTitle}</span>;
  }

  // Show animation with cursor
  const showCursor = animationPhase === 'deleting' || animationPhase === 'typing';

  return (
    <span>
      {displayedTitle}
      {showCursor && <Cursor />}
    </span>
  );
}

function Cursor() {
  return (
    <span
      className="animate-blink inline-block w-[2px] h-[1em] bg-current ml-[1px] align-middle"
      aria-hidden="true"
    />
  );
}
