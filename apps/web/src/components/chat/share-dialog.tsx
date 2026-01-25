import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getApiBaseUrl, getAppBaseUrl } from '@/lib/config/base-urls';
import { useTranslations } from '@/lib/i18n';
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
  const [ogRevision, setOgRevision] = useState(0);
  const prevOpenRef = useRef(open);
  const prevIsPublicRef = useRef(isPublic);
  const prevIsLoadingRef = useRef(isLoading);

  const incrementOgRevision = useCallback(() => {
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- OG image revision needs synchronous update on dialog state change
    setOgRevision(prev => prev + 1);
  }, []);

  useEffect(() => {
    const dialogJustOpened = open && !prevOpenRef.current;
    const loadingJustFinished = !isLoading && prevIsLoadingRef.current;

    const shouldRefresh = isPublic && (
      (dialogJustOpened && !isLoading)
      || loadingJustFinished
    );

    prevOpenRef.current = open;
    prevIsPublicRef.current = isPublic;
    prevIsLoadingRef.current = isLoading;

    if (shouldRefresh) {
      incrementOgRevision();
    }
  }, [open, isPublic, isLoading, incrementOgRevision]);

  const baseUrl = getAppBaseUrl();
  const shareUrl = `${baseUrl}/public/chat/${slug}`;
  const ogImageUrl = useMemo(() => {
    const apiBase = getApiBaseUrl();
    return `${apiBase}/og/chat?slug=${slug}&v=${ogRevision}-${Date.now()}`;
  }, [slug, ogRevision]);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const resetImageState = useCallback(() => {
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Image state reset on URL change requires synchronous setState
    setImageLoaded(false);
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Image state reset on URL change requires synchronous setState
    setImageError(false);
  }, []);

  useEffect(() => {
    resetImageState();
  }, [ogImageUrl, resetImageState]);

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    setImageError(false);
  }, []);

  const handleImageError = useCallback(() => {
    setImageError(true);
    setImageLoaded(false);
  }, []);

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
                loading={isLoading}
                loadingText={t('chat.makingPublic')}
              >
                {t('chat.makePublic')}
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

            <div className="flex flex-col gap-6">
              <div>
                <label className="text-sm font-medium text-foreground/90 mb-3 block">
                  {t('chat.shareDialog.copyLinkLabel')}
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      readOnly
                      value={shareUrl}
                      className="w-full pr-11 font-mono"
                      onClick={e => e.currentTarget.select()}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopy(shareUrl, 'link')}
                      className={cn(
                        'absolute right-0 inset-y-0 w-11 rounded-l-none rounded-r-xl text-muted-foreground hover:text-foreground',
                        copySuccess === 'link' && 'text-emerald-500 hover:text-emerald-500',
                      )}
                      aria-label={copySuccess === 'link' ? t('chat.shareDialog.copied') : t('chat.shareDialog.copyLink')}
                    >
                      {copySuccess === 'link'
                        ? <Icons.check className="size-4" />
                        : <Icons.copy className="size-4" />}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0 border-border/50 hover:bg-muted/50"
                    onClick={() => window.open(shareUrl, '_blank')}
                    aria-label={t('chat.shareDialog.openInNewTab')}
                  >
                    <Icons.externalLink className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-border/50 bg-muted/20">
                <div
                  className="relative w-full"
                  style={{ aspectRatio: '1200/630' }}
                >
                  {(isLoading || (!imageLoaded && !imageError)) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/30 animate-pulse">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Icons.loader className="size-6 animate-spin" />
                        <span className="text-sm">
                          {isLoading ? t('chat.shareDialog.generatingPreview') : t('chat.shareDialog.loadingPreview')}
                        </span>
                      </div>
                    </div>
                  )}

                  {imageError && !isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-muted/30 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <Icons.image className="size-8 opacity-50" />
                        <span className="text-sm">{t('chat.shareDialog.previewUnavailable')}</span>
                      </div>
                    </div>
                  )}

                  {!isLoading && (
                    <img
                      key={ogImageUrl}
                      src={ogImageUrl}
                      alt={t('chat.shareDialog.threadPreviewAlt')}
                      className={cn(
                        'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
                        imageLoaded && !imageError ? 'opacity-100' : 'opacity-0',
                      )}
                      onLoad={handleImageLoad}
                      onError={handleImageError}
                    />
                  )}
                </div>
              </div>
            </div>

            <DialogFooter bordered bleed>
              <Button
                onClick={onMakePrivate}
                loading={isLoading}
                loadingText={t('chat.makingPrivate')}
                variant="outline"
                className="w-full sm:w-auto h-10 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/40"
                startIcon={<Icons.lock />}
              >
                {t('chat.makePrivate')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type { ShareDialogProps };
