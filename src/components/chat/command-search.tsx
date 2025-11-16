'use client';
import { Search, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { useThreadsQuery } from '@/hooks/queries/chat';
import { useDebouncedValue } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

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
        'flex items-center gap-3 mx-2 my-1 px-3 py-2.5 rounded-full transition-all duration-200',
        'hover:bg-white/10 active:scale-[0.98]',
        selectedIndex === index ? 'bg-white/15 shadow-sm' : 'bg-transparent',
      )}
      onMouseEnter={() => {
        onSelect(index);
      }}
    >
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-sm font-medium truncate text-foreground">
          {thread.title}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {new Date(thread.updatedAt).toLocaleDateString()}
        </p>
      </div>
      {thread.isFavorite && (
        <div className="size-2 rounded-full bg-yellow-500 shrink-0" />
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
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
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
      if (!scrollViewportRef.current || !hasNextPage || isFetchingNextPage)
        return;
      const { scrollTop, scrollHeight, clientHeight } = scrollViewportRef.current;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
      if (scrollPercentage > 0.8) {
        fetchNextPage();
      }
    };
  });

  useEffect(() => {
    // SHADCN ScrollArea: Find viewport element (has data-slot="scroll-area-viewport")
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea)
      return;
    const viewport = scrollArea.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement;
    if (!viewport)
      return;
    scrollViewportRef.current = viewport;
    const handleScroll = () => {
      scrollHandlerRef.current?.();
    };
    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, []); // No dependencies - ref always has latest callback
  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
      <DialogContent
        ref={modalRef}
        glass={true}
        showCloseButton={false}
        className="!max-w-2xl p-0 gap-0"
        style={{
          width: 'calc(100vw - 2.5rem)',
          maxWidth: '672px',
        }}
      >
        {/* Fixed Header Section */}
        <DialogHeader className="flex flex-row items-center gap-3 bg-black/40 px-4 sm:px-5 md:px-6 py-4">
          <VisuallyHidden>
            <DialogTitle>{t('chat.searchChats')}</DialogTitle>
            <DialogDescription>{t('chat.searchChatsDescription')}</DialogDescription>
          </VisuallyHidden>
          <Search className="size-5 text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={t('chat.searchChats')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
          <button
            type="button"
            onClick={handleClose}
            className="size-9 shrink-0 flex items-center justify-center hover:bg-white/10 rounded-lg transition-colors"
            aria-label={t('actions.close')}
          >
            <X className="size-4.5 text-muted-foreground" />
          </button>
        </DialogHeader>

        {/* Scrollable Results Section */}
        <DialogBody className="h-[400px] border-t border-white/5 bg-black/30">
          <ScrollArea ref={scrollAreaRef} className="h-full">
            {isLoading && !threads.length
              ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )
              : threads.length > 0
                ? (
                    <div className="py-2">
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
          </ScrollArea>
        </DialogBody>

        {/* Fixed Footer Section */}
        <div className="flex items-center gap-4 px-4 sm:px-6 py-3 border-t border-white/5 text-xs text-muted-foreground shrink-0 bg-black/30">
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/70 font-mono text-xs">↑</kbd>
            <kbd className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/70 font-mono text-xs">↓</kbd>
            <span className="ml-0.5 text-white/50">{t('navigation.navigation')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/70 font-mono text-xs">↵</kbd>
            <span className="ml-0.5 text-white/50">{t('actions.select')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/70 font-mono text-xs">Esc</kbd>
            <span className="ml-0.5 text-white/50">{t('actions.close')}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
