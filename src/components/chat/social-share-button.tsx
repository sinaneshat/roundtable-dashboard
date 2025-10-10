'use client';

import { Check, Mail, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  EmailShareButton,
  FacebookShareButton,
  LinkedinShareButton,
  RedditShareButton,
  TwitterShareButton,
} from 'react-share';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { BRAND } from '@/constants/brand';
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
 * - Copy Link (fallback)
 *
 * Follows shadcn design patterns with glassmorphism effects
 */
type SocialShareButtonProps = {
  /** The URL to share */
  url: string;
  /** Title for the shared content */
  title: string;
  /** Optional description for platforms that support it */
  description?: string;
  /** Icon-only mode (no text) */
  iconOnly?: boolean;
  /** Custom className for the trigger button */
  className?: string;
};

export function SocialShareButton({
  url,
  title,
  description,
  iconOnly: _iconOnly = true,
  className,
}: SocialShareButtonProps) {
  const t = useTranslations('chat');
  const [isOpen, setIsOpen] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Prepare sharing text with brand mention
  const shareTitle = `${title} - ${BRAND.name}`;
  const shareDescription = description || `Check out this conversation on ${BRAND.name}, where multiple AI models collaborate to solve problems.`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopySuccess(true);
      setTimeout(() => {
        setCopySuccess(false);
        setIsOpen(false);
      }, 2000);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to copy link:', error);
      }
    }
  };

  // Share button configuration
  const shareButtons = [
    {
      name: 'Twitter/X',
      icon: (
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      Component: TwitterShareButton,
      props: { title: shareTitle, url },
      className: 'hover:text-[#1DA1F2]',
    },
    {
      name: 'LinkedIn',
      icon: (
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
      ),
      Component: LinkedinShareButton,
      props: { title: shareTitle, summary: shareDescription, source: BRAND.name, url },
      className: 'hover:text-[#0A66C2]',
    },
    {
      name: 'Facebook',
      icon: (
        <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      Component: FacebookShareButton,
      props: { quote: shareTitle, url },
      className: 'hover:text-[#1877F2]',
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
      className: 'hover:text-[#FF4500]',
    },
    {
      name: 'Email',
      icon: <Mail className="size-4" />,
      Component: EmailShareButton,
      props: { subject: shareTitle, body: `${shareDescription}\n\n${url}`, url },
      className: 'hover:text-blue-600',
    },
  ];

  return (
    <TooltipProvider>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('copyLink')}
                className={cn('transition-all duration-200', className)}
              >
                {copySuccess
                  ? (
                      <Check className="size-4 text-green-500 animate-in zoom-in-75 duration-300" />
                    )
                  : (
                      <Share2 className="size-4 text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-110" />
                    )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-sm">{copySuccess ? t('linkCopied') : t('shareThread')}</p>
          </TooltipContent>
        </Tooltip>

        <PopoverContent
          align="end"
          className="w-56 p-2"
          glass={true}
        >
          <div className="space-y-1">
            <div className="px-2 py-1.5">
              <p className="text-sm font-semibold">{t('shareThread')}</p>
              <p className="text-xs text-muted-foreground">{t('shareThreadDescription')}</p>
            </div>

            <div className="space-y-0.5">
              {shareButtons.map(({ name, icon, Component, props, className: itemClassName }) => (
                <Component key={name} {...props}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm',
                      'hover:bg-accent/50 transition-colors duration-200',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      itemClassName,
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    <span className="flex size-5 items-center justify-center shrink-0">
                      {icon}
                    </span>
                    <span>{name}</span>
                  </button>
                </Component>
              ))}

              {/* Copy Link as fallback */}
              <button
                type="button"
                onClick={handleCopyLink}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm',
                  'hover:bg-accent/50 transition-colors duration-200',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  copySuccess && 'text-green-500',
                )}
              >
                <span className="flex size-5 items-center justify-center shrink-0">
                  {copySuccess ? <Check className="size-4" /> : <Share2 className="size-4" />}
                </span>
                <span>{copySuccess ? t('linkCopied') : t('copyLink')}</span>
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
