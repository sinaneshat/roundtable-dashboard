'use client';

import { motion } from 'framer-motion';
import {
  BookOpen,
  Calendar,
  ChevronDown,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Lightbulb,
  Newspaper,
  Star,
  TrendingUp,
  User,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { WebSearchResultItem } from '@/api/routes/chat/schema';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';
import { buildGoogleFaviconUrl, safeExtractDomain } from '@/lib/utils';

type WebSearchResultCardEnhancedProps = {
  result: WebSearchResultItem;
  index: number;
  defaultExpanded?: boolean;
};

// Helper function to get content type icon
function getContentTypeIcon(contentType?: string) {
  switch (contentType) {
    case 'news':
      return Newspaper;
    case 'article':
      return FileText;
    case 'research':
      return BookOpen;
    case 'blog':
      return TrendingUp;
    default:
      return Globe;
  }
}

export function WebSearchResultCardEnhanced({
  result,
  index,
  defaultExpanded = false,
}: WebSearchResultCardEnhancedProps) {
  const t = useTranslations('chat.tools.webSearch');
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [faviconError, setFaviconError] = useState(false);
  const [fallbackFaviconError, setFallbackFaviconError] = useState(false);

  // ✅ TYPE-SAFE: Extract domain with safe URL parsing
  const domain = result.domain || safeExtractDomain(result.url, 'unknown');
  const cleanDomain = domain.replace('www.', '');
  const fallbackFaviconUrl = buildGoogleFaviconUrl(cleanDomain, 64);

  // Determine content display
  const hasFullContent = result.fullContent && result.fullContent.length > 0;
  const displayContent = hasFullContent ? result.fullContent : (result.content || result.excerpt);
  const contentPreview = displayContent && displayContent.length > 500
    ? `${displayContent.slice(0, 500)}...`
    : displayContent;

  // Favicon source with fallback
  const getFaviconSrc = (): string | null => {
    if (!faviconError && result.metadata?.faviconUrl) {
      return result.metadata.faviconUrl;
    }
    if (!fallbackFaviconError) {
      return fallbackFaviconUrl;
    }
    return null;
  };

  const faviconSrc = getFaviconSrc();

  // Calculate relevance percentage
  const relevancePercentage = Math.round(result.score * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Card className="overflow-hidden border-border/50 bg-card/50 hover:bg-card hover:border-primary/30 transition-all duration-200">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            {/* Favicon Avatar */}
            <Avatar className="size-10 flex-shrink-0">
              <AvatarImage
                src={faviconSrc || ''}
                alt={cleanDomain}
                onError={() => {
                  if (!faviconError) {
                    setFaviconError(true);
                  } else {
                    setFallbackFaviconError(true);
                  }
                }}
              />
              <AvatarFallback className="bg-muted/50 text-muted-foreground">
                <Globe className="size-5" />
              </AvatarFallback>
            </Avatar>

            {/* Title and Domain */}
            <div className="flex-1 min-w-0 space-y-1">
              <CardTitle className="text-base leading-snug">
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors line-clamp-2"
                >
                  {result.title}
                </a>
              </CardTitle>
              <CardDescription className="flex items-center gap-2">
                <span className="truncate">{cleanDomain}</span>
                <ExternalLink className="size-3 flex-shrink-0" />
              </CardDescription>
            </div>

            {/* Index Badge */}
            <Badge variant="outline" className="text-xs">
              #
              {index + 1}
            </Badge>
          </div>

          {/* Metadata Tags */}
          <div className="flex flex-wrap gap-1.5 pt-2">
            {/* Content Type */}
            {result.contentType && (() => {
              const Icon = getContentTypeIcon(result.contentType);
              return (
                <Badge variant="outline" className="text-xs">
                  <Icon className="size-3 mr-1" />
                  {t(`contentType.${result.contentType}`)}
                </Badge>
              );
            })()}

            {/* Author */}
            {result.metadata?.author && (
              <Badge variant="outline" className="text-xs">
                <User className="size-3 mr-1" />
                {result.metadata.author}
              </Badge>
            )}

            {/* Published Date */}
            {result.publishedDate && (
              <Badge variant="outline" className="text-xs">
                <Calendar className="size-3 mr-1" />
                {new Date(result.publishedDate).toLocaleDateString()}
              </Badge>
            )}

            {/* Reading Time */}
            {result.metadata?.readingTime && (
              <Badge variant="outline" className="text-xs">
                <Clock className="size-3 mr-1" />
                {result.metadata.readingTime}
                {' '}
                min read
              </Badge>
            )}

            {/* Word Count */}
            {result.metadata?.wordCount && (
              <Badge variant="outline" className="text-xs">
                <FileText className="size-3 mr-1" />
                {result.metadata.wordCount.toLocaleString()}
                {' '}
                words
              </Badge>
            )}

            {/* Full Content Indicator */}
            {hasFullContent && (
              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                <BookOpen className="size-3 mr-1" />
                Full Content
              </Badge>
            )}

            {/* Image Indicator */}
            {(result.metadata?.imageUrl || (result.images && result.images.length > 0)) && (
              <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                <ImageIcon className="size-3 mr-1" />
                {result.images ? result.images.length : 1}
                {' '}
                {result.images && result.images.length > 1 ? 'images' : 'image'}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Relevance Score */}
          {result.score > 0 && (
            <div className="space-y-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Star
                            className={cn(
                              'size-3.5',
                              relevancePercentage >= 80
                                ? 'text-green-600 fill-green-600/20 dark:text-green-400'
                                : relevancePercentage >= 60
                                  ? 'text-yellow-600 fill-yellow-600/20 dark:text-yellow-400'
                                  : 'text-orange-600 fill-orange-600/20 dark:text-orange-400',
                            )}
                          />
                          <span>{t('relevanceLabel')}</span>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-xs h-5',
                            relevancePercentage >= 80
                              ? 'bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-400'
                              : relevancePercentage >= 60
                                ? 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-400'
                                : 'bg-orange-500/10 text-orange-700 border-orange-500/20 dark:text-orange-400',
                          )}
                        >
                          {relevancePercentage}
                          % match
                        </Badge>
                      </div>
                      <Progress
                        value={relevancePercentage}
                        className={cn(
                          'h-1.5',
                          relevancePercentage >= 80
                            ? '[&>div]:bg-green-600 dark:[&>div]:bg-green-400'
                            : relevancePercentage >= 60
                              ? '[&>div]:bg-yellow-600 dark:[&>div]:bg-yellow-400'
                              : '[&>div]:bg-orange-600 dark:[&>div]:bg-orange-400',
                        )}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="space-y-1">
                      <p className="font-medium">{t('relevanceTooltip', { score: relevancePercentage })}</p>
                      <p className="text-xs text-muted-foreground">
                        {relevancePercentage >= 80
                          ? t('relevance.high')
                          : relevancePercentage >= 60
                            ? t('relevance.medium')
                            : t('relevance.low')}
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          <Separator className="opacity-30" />

          {/* Content Preview */}
          {displayContent && (
            <div className="space-y-2">
              <div className="text-sm text-foreground/80 leading-relaxed">
                <p className={cn(!isExpanded && 'line-clamp-3')}>
                  {isExpanded ? displayContent : contentPreview}
                </p>
              </div>

              {displayContent.length > 500 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="h-8 text-xs"
                >
                  <ChevronDown
                    className={cn('size-3.5 mr-1.5 transition-transform', isExpanded && 'rotate-180')}
                  />
                  {isExpanded ? 'Show less' : `Show more (${displayContent.length.toLocaleString()} characters)`}
                </Button>
              )}
            </div>
          )}

          {/* Key Points */}
          {result.keyPoints && result.keyPoints.length > 0 && (
            <>
              <Separator className="opacity-30" />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Lightbulb className="size-4 text-yellow-600 dark:text-yellow-400" />
                  <span>{t('keyPoints')}</span>
                  <Badge variant="secondary" className="text-xs">
                    {result.keyPoints.length}
                  </Badge>
                </div>
                <ul className="space-y-1.5 pl-1">
                  {result.keyPoints.map((point, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-primary mt-1">•</span>
                      <span className="flex-1">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {/* Visit Source Button */}
          <Button asChild variant="outline" size="sm" className="w-full">
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <ExternalLink className="size-4" />
              Visit Source
            </a>
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
