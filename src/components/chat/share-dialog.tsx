'use client';

import { useTranslations } from 'next-intl';
import {
  EmailShareButton,
  FacebookShareButton,
  LinkedinShareButton,
  RedditShareButton,
  TelegramShareButton,
  TwitterShareButton,
  WhatsappShareButton,
} from 'next-share';
import { useEffect, useRef, useState } from 'react';

import { ConfirmationDialog } from '@/components/chat/confirmation-dialog';
import { Icons } from '@/components/icons';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CometCard } from '@/components/ui/comet-card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SmartImage } from '@/components/ui/smart-image';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BRAND } from '@/constants';
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

const SOCIAL_PLATFORMS = [
  { id: 'twitter', name: 'X (Twitter)', Component: TwitterShareButton },
  { id: 'facebook', name: 'Facebook', Component: FacebookShareButton },
  { id: 'linkedin', name: 'LinkedIn', Component: LinkedinShareButton },
  { id: 'reddit', name: 'Reddit', Component: RedditShareButton },
  { id: 'whatsapp', name: 'WhatsApp', Component: WhatsappShareButton },
  { id: 'telegram', name: 'Telegram', Component: TelegramShareButton },
  { id: 'email', name: 'Email', Component: EmailShareButton },
] as const;

const SOCIAL_ICONS: Record<string, React.ReactNode> = {
  twitter: (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  facebook: (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  ),
  linkedin: (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  ),
  reddit: (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
    </svg>
  ),
  whatsapp: (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  ),
  telegram: (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  ),
  email: (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  ),
};

function CodeSnippet({ code, onCopy, copied }: { code: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-3">
        <code className="block font-mono text-xs text-foreground/90 whitespace-pre-wrap break-all">{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 size-7 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={onCopy}
      >
        {copied ? <Icons.check className="size-3.5 text-green-500" /> : <Icons.copy className="size-3.5" />}
      </Button>
    </div>
  );
}

export function ShareDialog({
  open,
  onOpenChange,
  slug,
  threadTitle,
  isPublic,
  isLoading,
  onMakePublic,
  onMakePrivate,
}: ShareDialogProps) {
  const t = useTranslations('chat');
  const tActions = useTranslations('actions');

  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [confirmingPrivate, setConfirmingPrivate] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const baseUrl = getAppBaseUrl();
  const shareUrl = `${baseUrl}/public/chat/${slug}`;
  const ogImageUrl = `${baseUrl}/public/chat/${slug}/opengraph-image`;
  const shareTitle = `${threadTitle} - ${BRAND.displayName}`;

  const embedHtml = `<iframe src="${shareUrl}/embed" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`;
  const embedMarkdown = `[![${threadTitle}](${ogImageUrl})](${shareUrl})`;

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
    if (!newOpen) {
      setConfirmingPrivate(false);
      setCopySuccess(null);
    }
    onOpenChange(newOpen);
  };

  const handleMakePrivate = () => setConfirmingPrivate(true);
  const handleConfirmPrivate = () => {
    onMakePrivate();
  };

  if (!isPublic) {
    return (
      <ConfirmationDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={t('shareThread')}
        description={t('makePublicConfirmDescription')}
        confirmText={t('makePublic')}
        confirmingText={t('makingPublic')}
        cancelText={tActions('cancel')}
        isLoading={isLoading}
        variant="default"
        onConfirm={onMakePublic}
      />
    );
  }

  if (confirmingPrivate) {
    return (
      <ConfirmationDialog
        open={open}
        onOpenChange={handleOpenChange}
        title={t('makePrivate')}
        description={t('shareDialog.privateWarningDescription')}
        confirmText={t('makePrivate')}
        confirmingText={t('makingPrivate')}
        cancelText={tActions('cancel')}
        isLoading={isLoading}
        variant="warning"
        onConfirm={handleConfirmPrivate}
        onCancel={() => setConfirmingPrivate(false)}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="!max-w-2xl !w-[calc(100vw-2.5rem)]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <DialogTitle className="text-xl">{t('shareThread')}</DialogTitle>
            <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
              {t('shareDialog.publicStatus')}
            </Badge>
          </div>
          <DialogDescription>{t('shareThreadDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Share Link Section */}
          <div className="space-y-3">
            <div className="text-sm font-medium">
              {t('shareDialog.copyLinkLabel')}
            </div>
            {/* Mobile: stack vertically, Desktop: horizontal */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Input
                  readOnly
                  value={shareUrl}
                  className="h-11 sm:h-10 w-full pr-11 sm:pr-9 font-mono text-sm bg-muted/50"
                  onClick={e => e.currentTarget.select()}
                />
                <button
                  type="button"
                  onClick={() => handleCopy(shareUrl, 'link')}
                  className={cn(
                    'absolute right-0 top-0 flex h-11 sm:h-10 w-11 sm:w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground',
                    copySuccess === 'link' && 'text-green-500 hover:text-green-500',
                  )}
                >
                  {copySuccess === 'link' ? <Icons.check className="size-5 sm:size-4" /> : <Icons.copy className="size-5 sm:size-4" />}
                </button>
              </div>
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-11 sm:h-10 flex-1 sm:flex-none" startIcon={<Icons.share className="size-4" />}>
                      {t('shareDialog.shareOn')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-1">
                    <div className="flex flex-col">
                      {SOCIAL_PLATFORMS.map(({ id, name, Component }) => (
                        <Component key={id} url={shareUrl} title={shareTitle} blankTarget>
                          <div
                            className="focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground relative flex w-full cursor-pointer select-none items-center gap-2 rounded-xl px-2 py-2.5 text-sm outline-none transition-colors [&_svg:not([class*='text-'])]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                          >
                            {SOCIAL_ICONS[id]}
                            <span>{name}</span>
                          </div>
                        </Component>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button variant="outline" size="icon" className="size-11 sm:size-10 shrink-0" onClick={() => window.open(shareUrl, '_blank')}>
                  <Icons.externalLink className="size-5 sm:size-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Preview Card - contained to prevent overflow */}
          <div className="py-2">
            <CometCard className="overflow-hidden">
              <div className="rounded-2xl bg-zinc-900 p-1">
                <SmartImage
                  src={ogImageUrl}
                  alt="Thread preview"
                  aspectRatio="1200/630"
                  unoptimized
                  containerClassName="rounded-xl overflow-hidden"
                />
              </div>
            </CometCard>
          </div>

          {/* Embed Options Accordion */}
          <Accordion type="single" collapsible className="w-full rounded-xl border border-border">
            <AccordionItem value="embed" className="border-0">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-3">
                  <Icons.code className="size-4 text-muted-foreground" />
                  <div className="flex flex-col items-start gap-1">
                    <span className="text-sm font-medium">{t('shareDialog.embedOptionsLabel')}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {t('shareDialog.embedOptionsDescription')}
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <Tabs defaultValue="html" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="html">{t('shareDialog.embedFormat.html')}</TabsTrigger>
                    <TabsTrigger value="markdown">{t('shareDialog.embedFormat.markdown')}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="html" className="mt-4">
                    <CodeSnippet
                      code={embedHtml}
                      onCopy={() => handleCopy(embedHtml, 'html')}
                      copied={copySuccess === 'html'}
                    />
                  </TabsContent>
                  <TabsContent value="markdown" className="mt-4">
                    <CodeSnippet
                      code={embedMarkdown}
                      onCopy={() => handleCopy(embedMarkdown, 'markdown')}
                      copied={copySuccess === 'markdown'}
                    />
                  </TabsContent>
                </Tabs>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <DialogFooter className="mt-2">
          <Button
            onClick={handleMakePrivate}
            className="w-full sm:w-auto h-11 sm:h-10 bg-amber-600 text-white hover:bg-amber-700"
            startIcon={<Icons.lock className="size-4" />}
          >
            {t('makePrivate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
