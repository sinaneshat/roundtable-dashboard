'use client';

import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Header Scroll Button
 *
 * A scroll-to-bottom button that can be placed in the header.
 * Independent of AI Elements StickToBottom context - manually finds and scrolls the conversation.
 *
 * Design:
 * - Glass design matching header aesthetics
 * - Shows when conversation is scrolled away from bottom
 * - Hides when at bottom
 * - Smooth scroll animation
 */
export function HeaderScrollButton({ ariaLabel = 'Scroll to bottom' }: { ariaLabel?: string }) {
  const [isVisible, setIsVisible] = useState(false);

  // Check scroll position and update visibility
  const checkScrollPosition = useCallback(() => {
    // Find the scroll container (SidebarInset for page-level scrolling)
    const scrollContainer = document.querySelector('[data-slot="sidebar-inset"]') as HTMLElement;

    if (!scrollContainer) {
      setIsVisible(false);
      return;
    }

    // Check if scrolled away from bottom (threshold: 100px)
    const { scrollHeight, scrollTop, clientHeight } = scrollContainer;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const shouldShow = distanceFromBottom > 100;

    setIsVisible(shouldShow);
  }, []);

  // Scroll to bottom handler
  const scrollToBottom = useCallback(() => {
    const scrollContainer = document.querySelector('[data-slot="sidebar-inset"]') as HTMLElement;

    if (!scrollContainer)
      return;

    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: 'smooth',
    });
  }, []);

  // Set up scroll listener
  useEffect(() => {
    const scrollContainer = document.querySelector('[data-slot="sidebar-inset"]') as HTMLElement;

    if (!scrollContainer)
      return;

    // Check initial position
    checkScrollPosition();

    // Listen to scroll events
    scrollContainer.addEventListener('scroll', checkScrollPosition, { passive: true });

    // Also check on window resize
    window.addEventListener('resize', checkScrollPosition, { passive: true });

    return () => {
      scrollContainer.removeEventListener('scroll', checkScrollPosition);
      window.removeEventListener('resize', checkScrollPosition);
    };
  }, [checkScrollPosition]);

  // Don't render if not visible
  if (!isVisible)
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
