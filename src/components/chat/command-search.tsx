'use client';
import { Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useThreadsQuery } from '@/hooks/queries/chat';
import { useDebouncedValue } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';
import { glassOverlay } from '@/lib/ui/glassmorphism';

type CommandSearchProps = {
  isOpen: boolean;
  onClose: () => void;
};
function SearchResultItem({
  thread,
  index,
  selectedIndex,
  onClose,
  onSelect,
}: {
  thread: { id: string; slug: string; title: string; updatedAt: string; isFavorite?: boolean | null };
  index: number;
  selectedIndex: number;
  onClose: () => void;
  onSelect: (index: number) => void;
}) {
  const href = `/chat/${thread.slug}`;
  return (
    <Link
      href={href}
      onClick={onClose}
      className={cn(
        'flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer',
        selectedIndex === index && 'bg-accent',
      )}
      onMouseEnter={() => {
        onSelect(index);
      }}
    >
      <div className="flex-1 min-w-0 overflow-hidden" style={{ maxWidth: '36rem' }}>
        <p
          className="text-sm font-medium truncate overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ maxWidth: '36rem' }}
        >
          {thread.title}
        </p>
        <p className="text-xs text-muted-foreground truncate overflow-hidden text-ellipsis whitespace-nowrap">
          {new Date(thread.updatedAt).toLocaleDateString()}
        </p>
      </div>
      {thread.isFavorite && (
        <div className="size-2 rounded-full bg-yellow-500" />
      )}
    </Link>
  );
}
export function CommandSearch({ isOpen, onClose }: CommandSearchProps) {
  const router = useRouter();
  const t = useTranslations();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const {
    data: threadsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useThreadsQuery(debouncedSearch || undefined);
  const threads = useMemo(() =>
    threadsData?.pages.flatMap(page =>
      page.success && page.data?.items ? page.data.items : [],
    ) || [], [threadsData]);
  const handleClose = useCallback(() => {
    setSearchQuery('');
    setSelectedIndex(0);
    onClose();
  }, [onClose]);
  // AI SDK v5 Pattern: Use requestAnimationFrame for focus after modal renders
  // This ensures the input is visible and properly mounted before focusing
  // More reliable than arbitrary setTimeout delays
  useEffect(() => {
    if (isOpen) {
      // Double rAF ensures focus happens after browser completes layout and paint
      const rafId = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          searchInputRef.current?.focus();
        });
      });
      return () => cancelAnimationFrame(rafId);
    }
    return undefined;
  }, [isOpen]);
  // React 19.2 Pattern: Use ref to store callback, preventing listener re-mounting
  // Ref allows reading latest values without causing effect to re-run
  const keyDownHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  // React 19.2: Store latest callback in ref using useLayoutEffect (synchronous, before paint)
  // This avoids the "Cannot access refs during render" rule violation
  useLayoutEffect(() => {
    keyDownHandlerRef.current = (e: KeyboardEvent) => {
      if (!isOpen)
        return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % threads.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + threads.length) % threads.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (threads[selectedIndex]) {
            router.push(`/chat/${threads[selectedIndex].slug}`);
            handleClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          handleClose();
          break;
      }
    };
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keyDownHandlerRef.current?.(e);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // No dependencies - ref always has latest callback
  // React 19.2 Pattern: Use ref to store click outside handler
  const clickOutsideHandlerRef = useRef<((event: MouseEvent) => void) | null>(null);

  // React 19.2: Store latest callback in ref using useLayoutEffect
  useLayoutEffect(() => {
    clickOutsideHandlerRef.current = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };
  });

  // AI SDK v5 Pattern: Use requestAnimationFrame to add listener after modal renders
  // This prevents click-outside from immediately firing during modal opening
  // More deterministic than arbitrary setTimeout delays
  useEffect(() => {
    if (!isOpen)
      return;
    const handleClickOutside = (event: MouseEvent) => {
      clickOutsideHandlerRef.current?.(event);
    };
    // Double rAF ensures listener is added after modal is fully rendered and painted
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.addEventListener('mousedown', handleClickOutside);
      });
    });
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]); // Only depend on isOpen - ref always has latest handleClose
  // React 19.2 Pattern: Use ref to store scroll handler
  // This prevents listener re-mounting when pagination state changes
  const scrollHandlerRef = useRef<(() => void) | null>(null);

  // React 19.2: Store latest callback in ref using useLayoutEffect
  useLayoutEffect(() => {
    scrollHandlerRef.current = () => {
      if (!scrollAreaRef.current || !hasNextPage || isFetchingNextPage)
        return;
      const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
      if (scrollPercentage > 0.8) {
        fetchNextPage();
      }
    };
  });

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea)
      return;
    const handleScroll = () => {
      scrollHandlerRef.current?.();
    };
    scrollArea.addEventListener('scroll', handleScroll);
    return () => scrollArea.removeEventListener('scroll', handleScroll);
  }, []); // No dependencies - ref always has latest callback
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={cn('fixed inset-0 z-[60]', glassOverlay)}
          />
          <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh] overflow-hidden pointer-events-none">
            <motion.div
              ref={modalRef}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-2xl mx-4 overflow-hidden pointer-events-auto"
            >
              <div className={cn('backdrop-blur-sm bg-background/95 border shadow-2xl', 'rounded-lg border overflow-hidden')}>
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  <Search className="size-5 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder={t('chat.searchChats')}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClose}
                    className="size-8"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                <div
                  ref={scrollAreaRef}
                  className="max-h-[60vh] overflow-y-auto overflow-x-hidden"
                >
                  {isLoading && !threads.length
                    ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      )
                    : threads.length > 0
                      ? (
                          <div>
                            {threads.map((thread, index) => (
                              <SearchResultItem
                                key={thread.id}
                                thread={thread}
                                index={index}
                                selectedIndex={selectedIndex}
                                onClose={handleClose}
                                onSelect={setSelectedIndex}
                              />
                            ))}
                            {isFetchingNextPage && (
                              <div className="flex items-center justify-center py-4">
                                <div className="size-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              </div>
                            )}
                          </div>
                        )
                      : (
                          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                            <p className="text-sm text-muted-foreground">{t('chat.noResults')}</p>
                            <p className="text-xs text-muted-foreground mt-1">{t('chat.noResultsDescription')}</p>
                          </div>
                        )}
                </div>
                <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-background border border-border">↑</kbd>
                    <kbd className="px-1.5 py-0.5 rounded bg-background border border-border">↓</kbd>
                    <span className="ml-1">{t('navigation.navigation')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-background border border-border">↵</kbd>
                    <span className="ml-1">{t('actions.select')}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded bg-background border border-border">Esc</kbd>
                    <span className="ml-1">{t('actions.close')}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
