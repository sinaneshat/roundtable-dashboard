'use client';
import { Check, Copy, Facebook, Globe, Linkedin, Loader2, Lock, Mail, MoreVertical, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  EmailShareButton,
  FacebookShareButton,
  LinkedinShareButton,
  RedditShareButton,
  TwitterShareButton,
} from 'react-share';

import type { ChatThread } from '@/api/routes/chat/schema';
import { SocialShareButton } from '@/components/chat/social-share-button';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { BRAND } from '@/constants/brand';
import { useToggleFavoriteMutation, useTogglePublicMutation } from '@/hooks/mutations/chat-mutations';
import { cn } from '@/lib/ui/cn';

type ChatThreadActionsProps = {
  thread: ChatThread | (Omit<ChatThread, 'createdAt' | 'updatedAt' | 'lastMessageAt'> & { createdAt: string | Date; updatedAt: string | Date; lastMessageAt: string | Date | null });
  slug: string;
  onDeleteClick?: () => void;
  isPublicMode?: boolean;
};
export function ChatThreadActions({ thread, slug, onDeleteClick, isPublicMode = false }: ChatThreadActionsProps) {
  const t = useTranslations('chat');
  const toggleFavoriteMutation = useToggleFavoriteMutation();
  const togglePublicMutation = useTogglePublicMutation();
  const [copySuccess, setCopySuccess] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const displayIsFavorite = toggleFavoriteMutation.isSuccess && toggleFavoriteMutation.data?.success
    ? toggleFavoriteMutation.data.data.thread.isFavorite
    : toggleFavoriteMutation.isPending && toggleFavoriteMutation.variables
      ? toggleFavoriteMutation.variables.isFavorite
      : thread.isFavorite;
  const displayIsPublic = togglePublicMutation.isSuccess && togglePublicMutation.data?.success
    ? togglePublicMutation.data.data.thread.isPublic
    : togglePublicMutation.isPending && togglePublicMutation.variables
      ? togglePublicMutation.variables.isPublic
      : thread.isPublic;

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')}/public/chat/${slug}`;
  const shareTitle = `${thread.title} - ${BRAND.displayName}`;
  const shareDescription = `Check out this AI collaboration on ${BRAND.displayName}`;

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess(true);
      copyTimeoutRef.current = setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
    } catch {
      // Silent fail
    }
  };

  const handleTogglePublic = async () => {
    const newIsPublic = !displayIsPublic;
    togglePublicMutation.mutate({
      threadId: thread.id,
      isPublic: newIsPublic,
      slug,
    });

    // Auto-copy link when making public
    if (newIsPublic) {
      setTimeout(() => {
        handleCopyLink();
      }, 500);
    }
  };

  const shareButtons = [
    {
      name: 'X (Twitter)',
      icon: (
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      Component: TwitterShareButton,
      props: { title: shareTitle, url: shareUrl },
    },
    {
      name: 'LinkedIn',
      icon: <Linkedin className="size-4" />,
      Component: LinkedinShareButton,
      props: { title: shareTitle, summary: shareDescription, source: BRAND.displayName, url: shareUrl },
    },
    {
      name: 'Facebook',
      icon: <Facebook className="size-4" />,
      Component: FacebookShareButton,
      props: { quote: shareTitle, url: shareUrl },
    },
    {
      name: 'Reddit',
      icon: (
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
        </svg>
      ),
      Component: RedditShareButton,
      props: { title: shareTitle, url: shareUrl },
    },
    {
      name: 'Email',
      icon: <Mail className="size-4" />,
      Component: EmailShareButton,
      props: { subject: shareTitle, body: `${shareDescription}\n\n${shareUrl}`, url: shareUrl },
    },
  ];
  return (
    <TooltipProvider>
      {/* Three-dot menu - positioned at far left, contains all actions */}
      {!isPublicMode && (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('moreOptions')}
                  className="transition-all duration-200"
                >
                  <MoreVertical className="size-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-sm">{t('moreOptions')}</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="bottom" align="end" className="w-56">
            {/* Share options - shown when thread is public */}
            {displayIsPublic && (
              <>
                <DropdownMenuLabel>
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{t('shareThread')}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {t('shareThreadDescription')}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {shareButtons.map(({ name, icon, Component, props }) => (
                  <Component
                    key={name}
                    {...props}
                    beforeOnClick={() => {
                      setIsOpen(false);
                    }}
                  >
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onSelect={(e) => {
                        e.preventDefault();
                      }}
                    >
                      {icon}
                      <span>{name}</span>
                    </DropdownMenuItem>
                  </Component>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleCopyLink} className="cursor-pointer">
                  {copySuccess ? <Check className="size-4" /> : <Copy className="size-4" />}
                  <span className={cn(copySuccess && 'text-green-500')}>
                    {copySuccess ? t('linkCopied') : t('copyLink')}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Make Public/Private toggle */}
            <DropdownMenuItem
              onClick={handleTogglePublic}
              disabled={togglePublicMutation.isPending}
            >
              {togglePublicMutation.isPending
                ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>{displayIsPublic ? t('makingPrivate') : t('makingPublic')}</span>
                    </>
                  )
                : displayIsPublic
                  ? (
                      <>
                        <Lock className="size-4" />
                        <span>{t('makePrivate')}</span>
                      </>
                    )
                  : (
                      <>
                        <Globe className="size-4" />
                        <span>{t('makePublic')}</span>
                      </>
                    )}
            </DropdownMenuItem>

            {/* Star/Favorite - with amber/yellow color */}
            <DropdownMenuItem
              onClick={() => {
                toggleFavoriteMutation.mutate({
                  threadId: thread.id,
                  isFavorite: !displayIsFavorite,
                  slug,
                });
              }}
              disabled={toggleFavoriteMutation.isPending}
              className={cn(
                displayIsFavorite && 'text-amber-600 dark:text-amber-500',
              )}
            >
              {toggleFavoriteMutation.isPending
                ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>{displayIsFavorite ? t('removingFromFavorites') : t('addingToFavorites')}</span>
                    </>
                  )
                : (
                    <>
                      <Star
                        className={cn(
                          'size-4',
                          displayIsFavorite && 'fill-current',
                        )}
                      />
                      <span>{displayIsFavorite ? t('removeFromFavorites') : t('addToFavorites')}</span>
                    </>
                  )}
            </DropdownMenuItem>

            {/* Delete - with red color */}
            {onDeleteClick && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDeleteClick}
                  variant="destructive"
                  className="cursor-pointer"
                >
                  <Trash2 className="size-4" />
                  <span>{t('deleteThread')}</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Show social share button in public mode */}
      {isPublicMode && displayIsPublic && (
        <SocialShareButton
          url={shareUrl}
          title={thread.title}
          description={`Check out this AI collaboration on ${thread.title}`}
          showTextOnLargeScreens={isPublicMode}
        />
      )}
    </TooltipProvider>
  );
}
