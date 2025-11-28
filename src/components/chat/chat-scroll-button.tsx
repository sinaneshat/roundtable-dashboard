'use client';
import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

type ChatScrollButtonProps = {
  variant?: 'floating' | 'header';
  className?: string;
};

export function ChatScrollButton({
  variant = 'floating',
  className,
}: ChatScrollButtonProps) {
  const [showButton, setShowButton] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let ticking = false;

    const checkScrollPosition = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Intentional: updating state based on scroll position
      setShowButton(distanceFromBottom > 200);
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(checkScrollPosition);
      }
    };

    checkScrollPosition();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    // Cancel any pending scroll
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    // ✅ BODY-BASED SCROLL: Use anchor position for accurate targeting
    rafRef.current = requestAnimationFrame(() => {
      const scrollAnchor = document.querySelector('[data-scroll-anchor="chat-bottom"]');
      let targetScrollTop: number;

      if (scrollAnchor) {
        // Calculate position based on anchor
        const anchorRect = scrollAnchor.getBoundingClientRect();
        const currentScrollTop = window.scrollY || document.documentElement.scrollTop;
        targetScrollTop = currentScrollTop + anchorRect.bottom - window.innerHeight;
      } else {
        // Fallback to document bottom
        targetScrollTop = document.documentElement.scrollHeight - window.innerHeight;
      }

      window.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      });
      rafRef.current = null;
    });
  }, []);

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
