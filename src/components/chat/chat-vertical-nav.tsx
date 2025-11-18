'use client';
import { LayoutGrid, MessageSquare, Plus, Search, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { CommandSearch } from '@/components/chat/command-search';
import { NavUser } from '@/components/chat/nav-user';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/constants/brand';
import { useNavigationReset } from '@/hooks/utils/use-navigation-reset';
import { cn } from '@/lib/ui/cn';

/**
 * ChatVerticalNav - Icon-only vertical navigation sidebar
 *
 * Matches the screenshot design:
 * - Circular gradient logo at top
 * - Vertical icon stack (layout, plus, search, messages, sparkles)
 * - User avatar at bottom
 * - Dark theme with narrow width (~80px)
 * - No expandable chat list (access via command search)
 */
export function ChatVerticalNav() {
  const router = useRouter();
  const t = useTranslations();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const handleNavigationReset = useNavigationReset();

  const handleNewChat = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleNavigationReset();
    router.push('/chat');
  }, [handleNavigationReset, router]);

  return (
    <>
      {/* Vertical sidebar - fixed on left side */}
      <div className="fixed left-0 top-0 z-50 flex h-full w-20 flex-col items-center gap-4 border-r border-border/50 bg-background/95 backdrop-blur-sm py-6">

        {/* Logo at top */}
        <Link
          href="/chat"
          onClick={handleNewChat}
          className="flex items-center justify-center mb-2"
        >
          <div className="relative h-12 w-12">
            <Image
              src={BRAND.logos.main}
              alt={BRAND.name}
              fill
              sizes="48px"
              className="object-contain"
              priority
            />
          </div>
        </Link>

        {/* Icon menu */}
        <nav className="flex flex-col items-center gap-2 flex-1">
          {/* Layout toggle icon - top right of logo per screenshot */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-10 w-10 rounded-full',
              'hover:bg-white/10 hover:backdrop-blur-sm',
              'transition-all duration-200',
            )}
            aria-label={t('navigation.dashboard')}
            asChild
          >
            <Link href="/chat">
              <LayoutGrid className="h-5 w-5" />
            </Link>
          </Button>

          {/* Plus icon - new chat */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNewChat}
            className={cn(
              'h-10 w-10 rounded-full',
              'hover:bg-white/10 hover:backdrop-blur-sm',
              'transition-all duration-200',
            )}
            aria-label={t('navigation.newChat')}
          >
            <Plus className="h-5 w-5" />
          </Button>

          {/* Search icon */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSearchOpen(true)}
            className={cn(
              'h-10 w-10 rounded-full',
              'hover:bg-white/10 hover:backdrop-blur-sm',
              'transition-all duration-200',
            )}
            aria-label={t('chat.searchChats')}
          >
            <Search className="h-5 w-5" />
          </Button>

          {/* Messages icon */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-10 w-10 rounded-full',
              'hover:bg-white/10 hover:backdrop-blur-sm',
              'transition-all duration-200',
            )}
            aria-label={t('navigation.messages')}
            asChild
          >
            <Link href="/chat">
              <MessageSquare className="h-5 w-5" />
            </Link>
          </Button>

          {/* Sparkles icon */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-10 w-10 rounded-full',
              'hover:bg-white/10 hover:backdrop-blur-sm',
              'transition-all duration-200',
            )}
            aria-label={t('navigation.features')}
            disabled
          >
            <Sparkles className="h-5 w-5 text-amber-500" />
          </Button>
        </nav>

        {/* User avatar at bottom */}
        <div className="mt-auto">
          <NavUser />
        </div>
      </div>

      {/* Command search modal */}
      <CommandSearch
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  );
}
