'use client';
import { ArrowDown } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

type ChatScrollButtonProps = {
  variant?: 'floating' | 'header';
  className?: string;
  scrollContainerId?: string;
};

export function ChatScrollButton({
  variant = 'floating',
  className,
  scrollContainerId = 'main-scroll-container',
}: ChatScrollButtonProps) {
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    // Find the scroll container
    const contentContainer = document.getElementById(scrollContainerId);
    const scrollContainer = contentContainer?.closest('[class*="overflow-y-auto"]') as HTMLElement
      || contentContainer?.closest('main') as HTMLElement
      || null;

    if (!scrollContainer) {
      return undefined;
    }

    let rafId: number | null = null;
    let lastScrollTime = 0;
    const throttleMs = 100;

    const checkScrollPosition = () => {
      const now = Date.now();
      if (now - lastScrollTime < throttleMs) {
        rafId = requestAnimationFrame(checkScrollPosition);
        return;
      }
      lastScrollTime = now;

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional: updating state based on scroll position
      setShowButton(distanceFromBottom > 200);
      rafId = null;
    };

    const handleScroll = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(checkScrollPosition);
      }
    };

    checkScrollPosition();
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [scrollContainerId]);

  const scrollToBottom = () => {
    // Find the scroll container
    const contentContainer = document.getElementById(scrollContainerId);
    const scrollContainer = contentContainer?.closest('[class*="overflow-y-auto"]') as HTMLElement
      || contentContainer?.closest('main') as HTMLElement
      || null;

    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  if (!showButton)
    return null;

  if (variant === 'header') {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'size-9',
          'hover:bg-accent hover:text-accent-foreground',
          'transition-all duration-200',
          className,
        )}
        onClick={scrollToBottom}
        aria-label="Scroll to bottom"
      >
        <ArrowDown className="size-4" />
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        'fixed bottom-32 right-4 z-30',
        'size-10 rounded-full shadow-lg',
        'bg-background',
        'border-border',
        'hover:bg-accent hover:text-accent-foreground',
        'transition-all duration-200',
        'md:right-6 lg:right-8',
        className,
      )}
      onClick={scrollToBottom}
      aria-label="Scroll to bottom"
    >
      <ArrowDown className="size-5" />
    </Button>
  );
}
