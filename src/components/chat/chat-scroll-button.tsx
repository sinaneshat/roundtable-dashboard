'use client';
import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/ui/cn';

type ChatScrollButtonProps = {
  variant?: 'floating' | 'header' | 'input';
  className?: string;
};

export function ChatScrollButton({
  variant = 'floating',
  className,
}: ChatScrollButtonProps) {
  const [showButton, setShowButton] = useState(false);
  const rafRef = useRef<number | null>(null);

  // ✅ REACT 19: useEffectEvent for scroll position check - stable handler

  const onCheckScrollPosition = useEffectEvent(() => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight;
    const clientHeight = window.innerHeight;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- setState in useEffectEvent is valid React 19 pattern
    setShowButton(distanceFromBottom > 200);
  });

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(() => {
          onCheckScrollPosition();
          ticking = false;
        });
      }
    };

    onCheckScrollPosition(); // Initial check
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

    // Scroll to absolute bottom of the document
    rafRef.current = requestAnimationFrame(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'smooth',
      });
      rafRef.current = null;
    });
  }, []);

  if (!showButton)
    return null;

  if (variant === 'input') {
    return (
      <div className="flex justify-center mb-2">
        <Button
          variant="outline"
          size="icon"
          className={cn(
            'size-9 rounded-full shadow-md',
            'bg-background/95 backdrop-blur-sm',
            'border-border/50',
            'hover:bg-accent hover:text-accent-foreground',
            'transition-all duration-200',
            className,
          )}
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="size-4" />
        </Button>
      </div>
    );
  }

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
