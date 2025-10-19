'use client';

import { ArrowDown } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

/**
 * Custom Scroll-to-Bottom Button
 *
 * Detects scroll position on the page-level scroll container (#chat-scroll-container)
 * and shows/hides the button accordingly. This is designed for page-level scrolling
 * where the main content area scrolls, not an inner div.
 *
 * Features:
 * - Appears when scrolled up from bottom (>100px from bottom)
 * - Smooth scroll to bottom on click
 * - Positioned fixed at bottom-right of content area
 * - Uses scroll event throttling for performance
 *
 * Architecture:
 * - Monitors scroll on #chat-scroll-container (the layout's content area)
 * - This is NOT using the AI Elements Conversation component's scroll detection
 * - This is for page-level scrolling as required by the design
 */
export function ChatScrollButton() {
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const scrollContainer = document.getElementById('chat-scroll-container');
    if (!scrollContainer)
      return;

    let rafId: number | null = null;
    let lastScrollTime = 0;
    const throttleMs = 100; // Throttle to once per 100ms for performance

    const checkScrollPosition = () => {
      const now = Date.now();
      if (now - lastScrollTime < throttleMs) {
        // Schedule next check
        rafId = requestAnimationFrame(checkScrollPosition);
        return;
      }

      lastScrollTime = now;

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // Show button when more than 100px from bottom
      setShowButton(distanceFromBottom > 100);

      rafId = null;
    };

    const handleScroll = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(checkScrollPosition);
      }
    };

    // Initial check
    checkScrollPosition();

    // Listen to scroll events
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  const scrollToBottom = () => {
    const scrollContainer = document.getElementById('chat-scroll-container');
    if (!scrollContainer)
      return;

    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: 'smooth',
    });
  };

  if (!showButton)
    return null;

  return (
    <Button
      variant="outline"
      size="icon"
      className={cn(
        'fixed bottom-32 right-4 z-30',
        'size-10 rounded-full shadow-lg',
        'bg-background/95 backdrop-blur-sm',
        'border-border/40',
        'hover:bg-accent hover:text-accent-foreground',
        'transition-all duration-200',
        'md:right-6 lg:right-8',
      )}
      onClick={scrollToBottom}
      aria-label="Scroll to bottom"
    >
      <ArrowDown className="size-5" />
    </Button>
  );
}
