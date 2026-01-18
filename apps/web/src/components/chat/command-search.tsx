import { KeyboardKeys } from '@roundtable/shared';
import { Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import { Icons } from '@/components/icons';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LinkLoadingIndicator } from '@/components/ui/link-loading-indicator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSidebar } from '@/components/ui/sidebar';
import { VisuallyHidden } from '@/components/ui/visually-hidden';
import { useSidebarThreadsQuery } from '@/hooks/queries';
import { useDebouncedValue } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
import { afterPaint } from '@/lib/ui/browser-timing';
import { cn } from '@/lib/ui/cn';
import type { ChatSidebarItem } from '@/services/api';

type CommandSearchProps = {
  isOpen: boolean;
  onClose: () => void;
};

type SearchResultThread = {
  id: string;
  slug: string;
  title: string;
  updatedAt: string;
};

type SearchResultItemProps = {
  thread: SearchResultThread;
  index: number;
  selectedIndex: number;
  onClose: () => void;
  onSelect: (index: number) => void;
};

function SearchResultItem({
  thread,
  index,
  selectedIndex,
  onClose,
  onSelect,
}: SearchResultItemProps) {
  const href = `/chat/${thread.slug}`;
  return (
    <Link
      to={href}
      preload={false}
      onClick={onClose}
      className={cn(
        'w-full p-3 transition-all text-left rounded-lg',
        'hover:bg-white/[0.07]',
        selectedIndex === index && 'bg-white/10',
      )}
      onMouseEnter={() => {
        onSelect(index);
      }}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-normal truncate text-foreground">
            {thread.title}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {new Date(thread.updatedAt).toLocaleDateString()}
          </p>
        </div>
        <LinkLoadingIndicator variant="spinner" size="sm" className="text-muted-foreground shrink-0" />
      </div>
    </Link>
  );
}
export function CommandSearch({ isOpen, onClose }: CommandSearchProps) {
  const navigate = useNavigate();
  const t = useTranslations();
  const { isMobile, setOpenMobile } = useSidebar();
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
  } = useSidebarThreadsQuery(debouncedSearch || undefined);
  const threads: SearchResultThread[] = useMemo(() => {
    if (!threadsData?.pages) {
      return [];
    }
    return threadsData.pages.flatMap((page) => {
      if (page.success && page.data?.items) {
        return page.data.items.map((item: ChatSidebarItem) => ({
          id: item.id,
          slug: item.slug ?? '',
          title: item.title ?? '',
          updatedAt: item.updatedAt,
        }));
      }
      return [];
    });
  }, [threadsData]);
  const handleClose = useCallback(() => {
    setSearchQuery('');
    setSelectedIndex(0);
    onClose();
    // Close mobile sidebar when closing search after navigation
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [onClose, isMobile, setOpenMobile]);

  useEffect(() => {
    if (isOpen) {
      return afterPaint(() => searchInputRef.current?.focus({ preventScroll: true }));
    }
    return undefined;
  }, [isOpen]);

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (!isOpen)
      return;
    switch (e.key) {
      case KeyboardKeys.ARROW_DOWN:
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % threads.length);
        break;
      case KeyboardKeys.ARROW_UP:
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + threads.length) % threads.length);
        break;
      case KeyboardKeys.ENTER:
        e.preventDefault();
        if (threads[selectedIndex]) {
          navigate({ to: `/chat/${threads[selectedIndex].slug}` });
          handleClose();
        }
        break;
      case KeyboardKeys.ESCAPE:
        e.preventDefault();
        handleClose();
        break;
    }
  });

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const onClickOutside = useEffectEvent((event: MouseEvent) => {
    if (modalRef.current && event.target instanceof Node && !modalRef.current.contains(event.target)) {
      handleClose();
    }
  });

  useEffect(() => {
    if (!isOpen)
      return;
    const cancelPaint = afterPaint(() => {
      document.addEventListener('mousedown', onClickOutside);
    });
    return () => {
      cancelPaint();
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [isOpen]);

  const onScroll = useEffectEvent(() => {
    if (!scrollViewportRef.current || !hasNextPage || isFetchingNextPage)
      return;
    const { scrollTop, scrollHeight, clientHeight } = scrollViewportRef.current;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
    if (scrollPercentage > 0.8) {
      fetchNextPage();
    }
  });

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea)
      return;
    const viewport = scrollArea.querySelector('[data-slot="scroll-area-viewport"]');
    if (!viewport || !(viewport instanceof HTMLDivElement))
      return;
    scrollViewportRef.current = viewport;
    viewport.addEventListener('scroll', onScroll);
    return () => viewport.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
      <DialogContent
        ref={modalRef}
        showCloseButton={false}
        glass
        className="!max-w-2xl !w-[calc(100vw-2.5rem)]"
      >
        <DialogHeader className="flex flex-row items-center gap-3 bg-card px-4 sm:px-5 md:px-6 py-4">
          <VisuallyHidden>
            <DialogTitle>{t('chat.searchChats')}</DialogTitle>
            <DialogDescription>{t('chat.searchChatsDescription')}</DialogDescription>
          </VisuallyHidden>
          <Icons.search className="size-5 text-muted-foreground shrink-0" />
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
            className="size-9 shrink-0 flex items-center justify-center hover:bg-white/[0.07] rounded-full transition-colors"
            aria-label={t('actions.close')}
          >
            <Icons.x className="size-5 text-muted-foreground" />
          </button>
        </DialogHeader>

        <DialogBody className="h-[400px] border-t border-border bg-card">
          <ScrollArea ref={scrollAreaRef} className="h-full">
            {isLoading && !threads.length
              ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )
              : threads.length > 0
                ? (
                    <div className="flex flex-col px-3 py-3">
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

        <div className="flex items-center gap-4 px-4 sm:px-5 md:px-6 py-4 border-t border-border text-xs text-muted-foreground shrink-0 bg-card">
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/70 font-mono text-xs">↑</kbd>
            <kbd className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/70 font-mono text-xs">↓</kbd>
            <span className="ml-1.5 text-white/50">{t('navigation.navigation')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/70 font-mono text-xs">↵</kbd>
            <span className="ml-1.5 text-white/50">{t('actions.select')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/70 font-mono text-xs">Esc</kbd>
            <span className="ml-1.5 text-white/50">{t('actions.close')}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
