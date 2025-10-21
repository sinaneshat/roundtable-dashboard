'use client';

import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useBoolean } from '@/hooks/utils';

/**
 * Header Scroll Button
 *
 * A scroll-to-bottom button that can be placed in the header.
 * Uses window-level scrolling for proper integration with page scroll.
 *
 * Design:
 * - Glass design matching header aesthetics
 * - Shows when conversation is scrolled away from bottom
 * - Hides when at bottom
 * - Smooth scroll animation
 */
export function HeaderScrollButton({ ariaLabel = 'Scroll to bottom' }: { ariaLabel?: string }) {
  const isVisible = useBoolean(false);

  // Check scroll position and update visibility
  const checkScrollPosition = useCallback(() => {
    // Use window/document scrolling (not a nested scroll container)
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;

    // Check if scrolled away from bottom (threshold: 100px)
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const shouldShow = distanceFromBottom > 100;

    isVisible.setValue(shouldShow);
  }, [isVisible]);

  // Scroll to bottom handler
  const scrollToBottom = useCallback(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'smooth',
    });
  }, []);

  // Set up scroll listener
  useEffect(() => {
    // Check initial position
    checkScrollPosition();

    // Listen to window scroll events
    window.addEventListener('scroll', checkScrollPosition, { passive: true });

    // Also check on window resize
    window.addEventListener('resize', checkScrollPosition, { passive: true });

    return () => {
      window.removeEventListener('scroll', checkScrollPosition);
      window.removeEventListener('resize', checkScrollPosition);
    };
  }, [checkScrollPosition]);

  // Don't render if not visible
  if (!isVisible.value)
    return null;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={scrollToBottom}
            aria-label={ariaLabel}
            className="transition-all duration-200"
          >
            <ArrowDown className="size-4 text-muted-foreground transition-all duration-200 hover:text-foreground hover:scale-110" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-sm">{ariaLabel}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
