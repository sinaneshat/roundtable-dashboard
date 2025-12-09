'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { IoShareSocial } from 'react-icons/io5';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

type SocialShareButtonProps = {
  url: string;
  title?: string;
  description?: string;
  showTextOnLargeScreens?: boolean;
  className?: string;
};

export function SocialShareButton({
  url,
  showTextOnLargeScreens = false,
  className,
}: SocialShareButtonProps) {
  const t = useTranslations('chat');
  const [copySuccess, setCopySuccess] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopySuccess(true);
      copyTimeoutRef.current = setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
    } catch {
      // Silent fail
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size={showTextOnLargeScreens ? 'sm' : 'icon'}
            aria-label={copySuccess ? t('linkCopied') : t('copyLink')}
            onClick={handleCopyLink}
            className={cn(
              'transition-all duration-200',
              showTextOnLargeScreens && 'gap-2',
              copySuccess && 'text-green-500',
              className,
            )}
          >
            {copySuccess
              ? <Check className="size-4 animate-in zoom-in-75 duration-300" />
              : <IoShareSocial className="size-4" />}
            {showTextOnLargeScreens && (
              <span className="hidden md:inline">
                {copySuccess ? t('linkCopied') : t('copyLink')}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{copySuccess ? t('linkCopied') : t('copyLink')}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
