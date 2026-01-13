'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SmartImage } from '@/components/ui/smart-image';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import { cn } from '@/lib/ui/cn';

type ShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  threadTitle: string;
  isPublic: boolean;
  isLoading: boolean;
  onMakePublic: () => void;
  onMakePrivate: () => void;
};

export function ShareDialog({
  open,
  onOpenChange,
  slug,
  threadTitle: _threadTitle,
  isPublic,
  isLoading,
  onMakePublic,
  onMakePrivate,
}: ShareDialogProps) {
  const t = useTranslations();

  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Revision counter - incremented when we need a fresh OG image
  const [ogRevision, setOgRevision] = useState(0);
  const prevOpenRef = useRef(open);
  const prevIsPublicRef = useRef(isPublic);

  // Increment revision when dialog opens with public thread, or thread transitions to public
  // This is an intentional state synchronization from props - not a derived value
  useEffect(() => {
    const dialogJustOpened = open && !prevOpenRef.current;
    const justBecamePublic = isPublic && !prevIsPublicRef.current;
    const shouldRefresh = !isLoading && ((dialogJustOpened && isPublic) || justBecamePublic);

    if (shouldRefresh) {
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- intentional cache bust on dialog/visibility state change
      setOgRevision(prev => prev + 1);
    }

    prevOpenRef.current = open;
    prevIsPublicRef.current = isPublic;
  }, [open, isPublic, isLoading]);

  const baseUrl = getAppBaseUrl();
  const shareUrl = `${baseUrl}/public/chat/${slug}`;
  // Derive cache key from revision - only non-zero revisions add cache bust param
  const ogImageUrl = useMemo(() => {
    const basePath = `${baseUrl}/public/chat/${slug}/opengraph-image`;
    return ogRevision > 0 ? `${basePath}?v=${ogRevision}-${Date.now()}` : basePath;
  }, [baseUrl, slug, ogRevision]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(type);
      copyTimeoutRef.current = setTimeout(() => setCopySuccess(null), 2000);
    } catch {
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (isLoading && !newOpen) {
      return;
    }
    if (!newOpen) {
      setCopySuccess(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(isPublic && '!max-w-lg !w-[calc(100vw-2rem)]')}
        showCloseButton={!isLoading}
      >
        {!isPublic && (
          <>
            <DialogHeader>
              <DialogTitle>{t('chat.shareThread')}</DialogTitle>
              <DialogDescription>
                {t('chat.makePublicConfirmDescription')}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                {t('actions.cancel')}
              </Button>
              <Button
                onClick={onMakePublic}
                disabled={isLoading}
                startIcon={isLoading ? <Icons.loader className="size-4 animate-spin" /> : undefined}
              >
                {isLoading ? t('chat.makingPublic') : t('chat.makePublic')}
              </Button>
            </DialogFooter>
          </>
        )}

        {isPublic && (
          <>
            <DialogHeader className="pb-2">
              <div className="flex items-center gap-3">
                <DialogTitle className="text-xl">{t('chat.shareThread')}</DialogTitle>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 font-medium">
                  {t('chat.shareDialog.publicStatus')}
                </Badge>
              </div>
              <DialogDescription className="text-muted-foreground/80">
                {t('chat.shareThreadDescription')}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground/90">
                  {t('chat.shareDialog.copyLinkLabel')}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      readOnly
                      value={shareUrl}
                      className="h-10 w-full pr-10 font-mono text-sm bg-muted/30 border-border/50 focus-visible:border-border"
                      onClick={e => e.currentTarget.select()}
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(shareUrl, 'link')}
                      className={cn(
                        'absolute right-0 top-0 flex h-10 w-10 items-center justify-center rounded-r-md text-muted-foreground transition-all hover:text-foreground',
                        copySuccess === 'link' && 'text-emerald-500 hover:text-emerald-500',
                      )}
                    >
                      {copySuccess === 'link'
                        ? <Icons.check className="size-4" />
                        : <Icons.copy className="size-4" />}
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-10 shrink-0 border-border/50 hover:bg-muted/50"
                    onClick={() => window.open(shareUrl, '_blank')}
                  >
                    <Icons.externalLink className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-border/50 bg-muted/20">
                {isLoading
                  ? (
                      <div
                        className="flex items-center justify-center bg-muted/30 animate-pulse"
                        style={{ aspectRatio: '1200/630' }}
                      >
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Icons.loader className="size-6 animate-spin" />
                          <span className="text-sm">{t('chat.shareDialog.generatingPreview')}</span>
                        </div>
                      </div>
                    )
                  : (
                      <SmartImage
                        key={ogImageUrl}
                        src={ogImageUrl}
                        alt="Thread preview"
                        aspectRatio="1200/630"
                        unoptimized
                        containerClassName="rounded-xl overflow-hidden"
                      />
                    )}
              </div>
            </div>

            <DialogFooter className="mt-4 pt-4 border-t border-border/30">
              <Button
                onClick={onMakePrivate}
                disabled={isLoading}
                variant="outline"
                className="w-full sm:w-auto h-10 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/40"
                startIcon={isLoading ? <Icons.loader className="size-4 animate-spin" /> : <Icons.lock className="size-4" />}
              >
                {isLoading ? t('chat.makingPrivate') : t('chat.makePrivate')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
