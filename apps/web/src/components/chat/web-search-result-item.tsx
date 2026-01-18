import { UNKNOWN_DOMAIN } from '@roundtable/shared';

import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useBoolean } from '@/hooks/utils';
import { useTranslations } from '@/lib/compat';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/ui/cn';
import { buildGoogleFaviconUrl, handleImageError, safeExtractDomain } from '@/lib/utils';
import type { WebSearchResultItemProps } from '@/types/api';

export function WebSearchResultItem({
  result,
  showDivider = true,
  className,
}: WebSearchResultItemProps) {
  const t = useTranslations('webSearch.result');
  const faviconError = useBoolean(false);
  const fallbackFaviconError = useBoolean(false);
  const isExpanded = useBoolean(false);

  const domain = result.domain || safeExtractDomain(result.url, UNKNOWN_DOMAIN);
  const cleanDomain = domain.replace('www.', '');
  const fallbackFaviconUrl = buildGoogleFaviconUrl(cleanDomain, 64);

  const rawContent = result.rawContent || result.fullContent || '';
  const displayContent = rawContent || result.content || result.excerpt || '';
  const contentLength = displayContent.length;
  const isLongContent = contentLength > 300;

  const getFaviconSrc = (): string | null => {
    if (!faviconError.value && result.metadata?.faviconUrl) {
      return result.metadata.faviconUrl;
    }
    if (!fallbackFaviconError.value) {
      return fallbackFaviconUrl;
    }
    return null;
  };

  const faviconSrc = getFaviconSrc();

  const pageImages = result.images || [];
  const metaImage = result.metadata?.imageUrl;
  const allImages = [
    ...(metaImage ? [{ url: metaImage, alt: result.title }] : []),
    ...pageImages,
  ];

  return (
    <div className={cn('py-3', showDivider && 'border-b border-border/10 last:border-0', className)}>
      <div className="flex-1 min-w-0 pb-1">
        <div className="flex items-start gap-2">
          <Avatar className="size-4 flex-shrink-0 mt-0.5">
            {faviconSrc && (
              <AvatarImage
                src={faviconSrc}
                alt={cleanDomain}
                onError={e => handleImageError(e, () => {
                  if (!faviconError.value) {
                    faviconError.onTrue();
                  } else {
                    fallbackFaviconError.onTrue();
                  }
                })}
              />
            )}
            <AvatarFallback className="bg-muted/50">
              <Icons.globe className="size-2.5 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-foreground hover:text-primary transition-colors line-clamp-1 flex items-center gap-1.5 group"
            >
              <span className="truncate">{result.title}</span>
              <Icons.externalLink className="size-3 opacity-0 group-hover:opacity-60 flex-shrink-0 transition-opacity" />
            </a>
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mt-0.5">
              <span>{cleanDomain}</span>
              {result.score != null && result.score >= 0.01 && (
                <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
                  {Math.round(result.score * 100)}
                  %
                  {' '}
                  {t('relevance')}
                </Badge>
              )}
              {result.publishedDate && (
                <span className="flex items-center gap-0.5">
                  <Icons.calendar className="size-2.5" />
                  {formatRelativeTime(result.publishedDate)}
                </span>
              )}
              {result.metadata?.author && (
                <span className="flex items-center gap-0.5">
                  <Icons.user className="size-2.5" />
                  {result.metadata.author}
                </span>
              )}
              {typeof result.metadata?.readingTime === 'number' && result.metadata.readingTime > 0 && (
                <span className="flex items-center gap-0.5">
                  <Icons.clock className="size-2.5" />
                  {t('minRead', { min: result.metadata.readingTime })}
                </span>
              )}
              {typeof result.metadata?.wordCount === 'number' && result.metadata.wordCount > 0 && (
                <span className="flex items-center gap-0.5">
                  <Icons.bookOpen className="size-2.5" />
                  {result.metadata.wordCount.toLocaleString()}
                  {' '}
                  {t('words')}
                </span>
              )}
            </div>
          </div>
        </div>

        {displayContent && (
          <Collapsible open={isExpanded.value} onOpenChange={isExpanded.setValue} className="mt-2">
            <div className="text-xs text-muted-foreground leading-relaxed">
              <div className={cn(!isExpanded.value && isLongContent && 'line-clamp-2')}>
                {displayContent}
              </div>
              {isLongContent && (
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-0 h-5 text-xs mt-1 text-primary/70 hover:text-primary hover:bg-transparent"
                  >
                    <Icons.chevronDown className={cn('size-3 mr-0.5 transition-transform', isExpanded.value && 'rotate-180')} />
                    {isExpanded.value ? t('collapseLess') : t('expandMore')}
                  </Button>
                </CollapsibleTrigger>
              )}
            </div>
            <CollapsibleContent />
          </Collapsible>
        )}

        {allImages.length > 0 && (
          <div className="mt-2.5 flex gap-1.5 flex-wrap">
            {allImages.slice(0, 4).map((img, idx) => (
              <a
                // eslint-disable-next-line react/no-array-index-key -- images may have duplicate URLs, idx ensures uniqueness
                key={`${img.url}-${idx}`}
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 w-12 h-9 rounded-md overflow-hidden bg-muted/30 border border-border/20 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer group"
                title={`View on ${cleanDomain}`}
              >
                <img
                  src={img.url}
                  alt={img.alt || result.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </a>
            ))}
            {allImages.length > 4 && (
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 w-12 h-9 rounded-md bg-muted/20 border border-border/20 flex items-center justify-center text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
                title={`View all images on ${cleanDomain}`}
              >
                +
                {allImages.length - 4}
              </a>
            )}
          </div>
        )}

        {result.keyPoints && result.keyPoints.length > 0 && (
          <div className="mt-2.5 space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Icons.sparkles className="size-3" />
              <span>{t('keyPoints')}</span>
            </div>
            <ul className="text-xs text-foreground/80 space-y-0.5 pl-4">
              {result.keyPoints.slice(0, 3).map((point, idx) => (
                // eslint-disable-next-line react/no-array-index-key -- index is stable for static key points
                <li key={idx} className="list-disc list-outside">
                  {point}
                </li>
              ))}
              {result.keyPoints.length > 3 && (
                <li className="text-muted-foreground list-none">
                  +
                  {result.keyPoints.length - 3}
                  {' '}
                  {t('morePoints')}
                </li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
