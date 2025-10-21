'use client';

import { ArrowDown } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

type ChatScrollButtonProps = {
  variant?: 'floating' | 'header';
  className?: string;
};

/**
 * Custom Scroll-to-Bottom Button
 *
 * Detects scroll position on window-level scrolling and shows/hides the button accordingly.
 *
 * Features:
 * - Appears when scrolled up from bottom (>200px from bottom)
 * - Smooth scroll to bottom on click
 * - Two variants: floating (bottom-right) or header (inline in header)
 * - Uses scroll event throttling for performance
 * - Accounts for bottom padding to scroll to content, not excessive padding
 *
 * Architecture:
 * - Monitors scroll on window (document.documentElement)
 * - Scrolls to content bottom, not document bottom (accounts for padding)
 */
export function ChatScrollButton({ variant = 'floating', className }: ChatScrollButtonProps = {}) {
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
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

      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // Show button when more than 200px from bottom
      setShowButton(distanceFromBottom > 200);

      rafId = null;
    };

    const handleScroll = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(checkScrollPosition);
      }
    };

    // Initial check
    checkScrollPosition();

    // Listen to scroll events on window
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  const scrollToBottom = () => {
    // ✅ Scroll to content bottom, accounting for bottom padding
    const contentContainer = document.getElementById('chat-scroll-container');
    if (contentContainer) {
      // Calculate the bottom of the content (not the full document height)
      const contentBottom = contentContainer.offsetTop + contentContainer.scrollHeight;

      // Scroll to show the content bottom, accounting for viewport height
      const targetScroll = contentBottom - window.innerHeight;

      window.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth',
      });
    } else {
      // Fallback: scroll to document height
      window.scrollTo({
        top: document.documentElement.scrollHeight,
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
        'bg-background/95 backdrop-blur-sm',
        'border-border/40',
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
