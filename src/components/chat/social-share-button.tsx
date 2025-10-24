'use client';

import { Check, Copy, Facebook, Linkedin, Mail, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  EmailShareButton,
  FacebookShareButton,
  LinkedinShareButton,
  RedditShareButton,
  TwitterShareButton,
} from 'react-share';

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
import { useBoolean } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

/**
 * Social Share Button Component
 *
 * Provides a dropdown menu with social media sharing options:
 * - Twitter/X
 * - LinkedIn
 * - Facebook
 * - Reddit
 * - Email
 * - Copy Link
 *
 * Uses shadcn DropdownMenu pattern for consistent UX
 */
type SocialShareButtonProps = {
  /** The URL to share */
  url: string;
  /** Title for the shared content */
  title: string;
  /** Optional description for platforms that support it */
  description?: string;
  /** Show text on larger screens, icon only on small screens */
  showTextOnLargeScreens?: boolean;
  /** Custom className for the trigger button */
  className?: string;
};

export function SocialShareButton({
  url,
  title,
  description,
  showTextOnLargeScreens = false,
  className,
}: SocialShareButtonProps) {
  const t = useTranslations('chat');
  const isOpen = useBoolean(false);
  const copySuccess = useBoolean(false);

  // Prepare sharing text with brand mention
  const shareTitle = `${title} - ${BRAND.displayName}`;
  const shareDescription = description || `Check out this conversation on ${BRAND.displayName}, where multiple AI models collaborate to solve problems.`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      copySuccess.onTrue();
      setTimeout(() => {
        copySuccess.onFalse();
        isOpen.onFalse();
      }, 2000);
    } catch {
      // Clipboard copy failed - gracefully handled by not showing success message
    }
  };

  // Social share platforms configuration
  const shareButtons = [
    {
      name: 'X (Twitter)',
      icon: (
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      Component: TwitterShareButton,
      props: { title: shareTitle, url },
    },
    {
      name: 'LinkedIn',
      icon: <Linkedin className="size-4" />,
      Component: LinkedinShareButton,
      props: { title: shareTitle, summary: shareDescription, source: BRAND.displayName, url },
    },
    {
      name: 'Facebook',
      icon: <Facebook className="size-4" />,
      Component: FacebookShareButton,
      props: { quote: shareTitle, url },
    },
    {
      name: 'Reddit',
      icon: (
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
        </svg>
      ),
      Component: RedditShareButton,
      props: { title: shareTitle, url },
    },
    {
      name: 'Email',
      icon: <Mail className="size-4" />,
      Component: EmailShareButton,
      props: { subject: shareTitle, body: `${shareDescription}\n\n${url}`, url },
    },
  ];

  return (
    <DropdownMenu open={isOpen.value} onOpenChange={isOpen.setValue}>
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size={showTextOnLargeScreens ? 'sm' : 'icon'}
                aria-label={t('shareThread')}
                className={cn(
                  'transition-all duration-200',
                  showTextOnLargeScreens && 'gap-2',
                  copySuccess.value && 'text-green-500',
                  className,
                )}
              >
                {copySuccess.value
                  ? (
                      <Check className="size-4 animate-in zoom-in-75 duration-300" />
                    )
                  : (
                      <Share2 className="size-4" />
                    )}
                {showTextOnLargeScreens && (
                  <span className="hidden md:inline">
                    {copySuccess.value ? t('linkCopied') : t('shareConversation')}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{copySuccess.value ? t('linkCopied') : t('shareThread')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent align="end" className="w-56">
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
            // Wrap in DropdownMenuItem for proper styling
            beforeOnClick={() => {
              isOpen.onFalse();
            }}
          >
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={(e) => {
                e.preventDefault();
              }}
            >
              <span className="mr-2">{icon}</span>
              <span>{name}</span>
            </DropdownMenuItem>
          </Component>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="cursor-pointer"
          onClick={handleCopyLink}
        >
          <span className="mr-2">
            {copySuccess.value ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
          </span>
          <span className={cn(copySuccess.value && 'text-green-500')}>
            {copySuccess.value ? t('linkCopied') : t('copyLink')}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
