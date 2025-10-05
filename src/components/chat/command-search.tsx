'use client';

import { Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { Chat } from '@/lib/types/chat';
import { cn } from '@/lib/ui/cn';

type CommandSearchProps = {
  chats: Chat[];
  isOpen: boolean;
  onClose: () => void;
};

export function CommandSearch({ chats, isOpen, onClose }: CommandSearchProps) {
  const router = useRouter();
  const t = useTranslations();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter chats based on search query
  const filteredChats = useMemo(() => {
    if (!searchQuery)
      return chats.slice(0, 8);
    return chats.filter(chat =>
      chat.title.toLowerCase().includes(searchQuery.toLowerCase()),
    ).slice(0, 8);
  }, [chats, searchQuery]);

  // Reset search when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen)
        return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % filteredChats.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + filteredChats.length) % filteredChats.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredChats[selectedIndex]) {
            router.push(`/chat/${filteredChats[selectedIndex].slug}`);
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
  }, [isOpen, filteredChats, selectedIndex, router, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Search Modal */}
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] overflow-hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -10 }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 35,
                duration: 0.2,
              }}
              className="relative w-full max-w-2xl mx-4 overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="bg-background border border-border rounded-lg shadow-2xl overflow-hidden">
                {/* Search Input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  <Search className="size-5 text-muted-foreground" />
                  <input
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
                <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
                  {filteredChats.length > 0
                    ? (
                        <motion.div
                          initial="hidden"
                          animate="show"
                          variants={{
                            hidden: { opacity: 0 },
                            show: {
                              opacity: 1,
                              transition: {
                                staggerChildren: 0.03,
                                delayChildren: 0.05,
                              },
                            },
                          }}
                        >
                          {filteredChats.map((chat, index) => (
                            <motion.div
                              key={chat.id}
                              variants={{
                                hidden: { opacity: 0, y: -8 },
                                show: { opacity: 1, y: 0 },
                              }}
                              transition={{
                                type: 'spring',
                                stiffness: 500,
                                damping: 40,
                              }}
                            >
                              <Link
                                href={`/chat/${chat.slug}`}
                                onClick={onClose}
                                className={cn(
                                  'flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors cursor-pointer',
                                  selectedIndex === index && 'bg-accent',
                                )}
                                onMouseEnter={() => setSelectedIndex(index)}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{chat.title}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {chat.messages.length > 0 ? chat.messages[chat.messages.length - 1]?.content : t('chat.noMessages')}
                                  </p>
                                </div>
                                {chat.isFavorite && (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: 'spring', stiffness: 500 }}
                                  >
                                    <div className="size-2 rounded-full bg-yellow-500" />
                                  </motion.div>
                                )}
                              </Link>
                            </motion.div>
                          ))}
                        </motion.div>
                      )
                    : (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex flex-col items-center justify-center py-12 px-4 text-center"
                        >
                          <p className="text-sm text-muted-foreground">{t('chat.noResults')}</p>
                          <p className="text-xs text-muted-foreground mt-1">{t('chat.noResultsDescription')}</p>
                        </motion.div>
                      )}
                </div>

                {/* Footer with keyboard shortcuts */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.15, duration: 0.2 }}
                  className="flex items-center gap-4 px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground"
                >
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
                </motion.div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
