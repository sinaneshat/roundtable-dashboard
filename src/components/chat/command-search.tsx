'use client';

import { Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useThreadsQuery } from '@/hooks/queries/chat-threads';
import { useDebouncedValue } from '@/hooks/utils/use-debounced-value';
import { cn } from '@/lib/ui/cn';
import { glassOverlay } from '@/lib/ui/glassmorphism';

type CommandSearchProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function CommandSearch({ isOpen, onClose }: CommandSearchProps) {
  const router = useRouter();
  const t = useTranslations();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Refs for click-outside detection
  const modalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Debounce search query for API calls (300ms delay)
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // Fetch threads with debounced search (10 items per page for search)
  const {
    data: threadsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useThreadsQuery(debouncedSearch || undefined);

  // Extract threads from pages
  const threads = useMemo(() =>
    threadsData?.pages.flatMap(page =>
      page.success && page.data?.items ? page.data.items : [],
    ) || [], [threadsData]);

  // Reset search when modal closes
  useEffect(() => {
    if (!isOpen) {
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Cleanup state when modal closes
      setSearchQuery('');
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Cleanup state when modal closes
      setSelectedIndex(0);
    } else {
      // Focus search input when modal opens
      const timeoutId = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
    return undefined;
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, threads, selectedIndex, router, onClose]);

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen)
      return;

    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    // Add listener with a small delay to avoid immediate closing
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (!scrollAreaRef.current || !hasNextPage || isFetchingNextPage)
      return;

    const { scrollTop, scrollHeight, clientHeight } = scrollAreaRef.current;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

    // Load more when scrolled to 80% of the content
    if (scrollPercentage > 0.8) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Attach scroll listener
  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea)
      return;

    scrollArea.addEventListener('scroll', handleScroll);
    return () => scrollArea.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={cn('fixed inset-0 z-[60]', glassOverlay)}
          />

          {/* Search Modal */}
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
                {/* Search Input */}
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
                    onClick={onClose}
                    className="size-8"
                  >
                    <X className="size-4" />
                  </Button>
                </div>

                {/* Search Results */}
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
                              <Link
                                key={thread.id}
                                href={`/chat/${thread.slug}`}
                                onClick={onClose}
                                className={cn(
                                  'flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer',
                                  selectedIndex === index && 'bg-accent',
                                )}
                                onMouseEnter={() => setSelectedIndex(index)}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{thread.title}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {new Date(thread.updatedAt).toLocaleDateString()}
                                  </p>
                                </div>
                                {thread.isFavorite && (
                                  <div className="size-2 rounded-full bg-yellow-500" />
                                )}
                              </Link>
                            ))}
                            {/* Loading more indicator */}
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

                {/* Footer with keyboard shortcuts */}
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
