'use client';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronUp,
  Globe,
  User,
} from 'lucide-react';
import { useState } from 'react';

import type { WebSearchResultItem } from '@/api/routes/chat/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

type WebSearchResultCardProps = {
  result: WebSearchResultItem;
  index: number;
  className?: string;
  defaultExpanded?: boolean;
};

export function WebSearchResultCard({
  result,
  index,
  className,
  defaultExpanded = false,
}: WebSearchResultCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showFullContent, setShowFullContent] = useState(false);

  const hasFullContent = result.fullContent && result.fullContent.length > 0;
  const hasMetadata = result.metadata && Object.keys(result.metadata).length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={className}
    >
      <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/20 transition-all duration-200">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {/* Favicon */}
                <div className="size-5 rounded overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
                  {result.metadata?.faviconUrl
                    ? (
                        // eslint-disable-next-line next/no-img-element -- External favicon from arbitrary search result domains
                        <img
                          src={result.metadata.faviconUrl}
                          alt=""
                          className="size-full object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )
                    : (
                        <Globe className="size-3 text-muted-foreground" />
                      )}
                </div>
                <Badge variant="outline" className="text-xs">
                  Source
                  {' '}
                  {index + 1}
                </Badge>
              </div>

              <CardTitle className="line-clamp-2 text-base">{result.title}</CardTitle>

              <CardDescription className="mt-1 flex items-center gap-2 text-xs">
                <Globe className="size-3" />
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline text-primary/80 truncate max-w-sm"
                >
                  {result.domain}
                </a>
                <ArrowUpRight className="size-3 text-primary/60" />
              </CardDescription>
            </div>

            {result.metadata?.imageUrl && (
              <div className="relative size-16 rounded-md overflow-hidden border border-border/50">
                {/* eslint-disable-next-line next/no-img-element -- External image from search result, arbitrary domains */}
                <img
                  src={result.metadata.imageUrl}
                  alt=""
                  className="object-cover size-full"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent" />
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Excerpt/Description */}
          <div className="text-sm text-muted-foreground">
            {result.metadata?.description || result.excerpt || result.content}
          </div>

          {/* Metadata badges */}
          {hasMetadata && (
            <div className="flex flex-wrap gap-2">
              {result.metadata?.author && (
                <Badge variant="outline" className="text-xs">
                  <User className="size-3 mr-1" />
                  {result.metadata.author}
                </Badge>
              )}
              {result.publishedDate && (
                <Badge variant="outline" className="text-xs">
                  <Calendar className="size-3 mr-1" />
                  {new Date(result.publishedDate).toLocaleDateString()}
                </Badge>
              )}
              {result.metadata?.readingTime && (
                <Badge variant="outline" className="text-xs">
                  <BookOpen className="size-3 mr-1" />
                  {result.metadata.readingTime}
                  {' '}
                  min read
                </Badge>
              )}
              {result.metadata?.wordCount && (
                <Badge variant="outline" className="text-xs">
                  {result.metadata.wordCount.toLocaleString()}
                  {' '}
                  words
                </Badge>
              )}
            </div>
          )}

          {/* Full content collapsible */}
          {hasFullContent && (
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between hover:bg-primary/5"
                >
                  <span className="text-xs">
                    {isExpanded ? 'Hide' : 'Show'}
                    {' '}
                    full content
                  </span>
                  {isExpanded
                    ? (
                        <ChevronUp className="size-4" />
                      )
                    : (
                        <ChevronDown className="size-4" />
                      )}
                </Button>
              </CollapsibleTrigger>

              <AnimatePresence>
                {isExpanded && (
                  <CollapsibleContent forceMount>
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Separator className="my-3" />

                      <div className="space-y-3">
                        {/* Content preview with expand option */}
                        <ScrollArea
                          className={`rounded-md border border-border/30 bg-muted/30 p-3 ${
                            showFullContent ? 'max-h-96' : 'max-h-48'
                          }`}
                        >
                          <div className="text-sm whitespace-pre-wrap">
                            {showFullContent
                              ? result.fullContent
                              : `${result.fullContent?.substring(0, 1000)}...`}
                          </div>
                        </ScrollArea>

                        {result.fullContent && result.fullContent.length > 1000 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowFullContent(!showFullContent)}
                            className="w-full"
                          >
                            {showFullContent ? 'Show less' : 'Show more'}
                          </Button>
                        )}

                        {/* Progress indicator for content completeness */}
                        {result.metadata?.wordCount && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Content extracted</span>
                              <span>
                                {Math.min(
                                  100,
                                  Math.round((result.fullContent?.length || 0) / 100),
                                )}
                                %
                              </span>
                            </div>
                            <Progress
                              value={Math.min(
                                100,
                                Math.round((result.fullContent?.length || 0) / 100),
                              )}
                              className="h-1"
                            />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </CollapsibleContent>
                )}
              </AnimatePresence>
            </Collapsible>
          )}

          {/* View source button */}
          <div className="pt-2">
            <Button asChild variant="outline" size="sm" className="w-full">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                <Globe className="size-4" />
                View original source
                <ArrowUpRight className="size-4" />
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
