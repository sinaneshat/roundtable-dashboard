'use client';

import { ChevronDown, ChevronUp, Clock, Filter, Globe, Layers, Lightbulb, Target } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/ui/cn';

type WebSearchParametersDisplayProps = {
  autoParameters?: {
    topic?: string;
    timeRange?: string;
    searchDepth?: string;
    reasoning?: string;
  };
  query?: string;
  className?: string;
};

export function WebSearchParametersDisplay({
  autoParameters,
  query,
  className,
}: WebSearchParametersDisplayProps) {
  const t = useTranslations('chat.tools.webSearch.parameters');
  const [isOpen, setIsOpen] = useState(false);

  // Don't render if no parameters are available
  if (!autoParameters && !query) {
    return null;
  }

  const hasParameters = autoParameters && (
    autoParameters.topic
    || autoParameters.timeRange
    || autoParameters.searchDepth
    || autoParameters.reasoning
  );

  if (!hasParameters && !query) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={cn('', className)}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between px-3 py-2 h-auto hover:bg-muted/50 border border-border/40 rounded-lg"
        >
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('title')}</span>
            {hasParameters && (
              <Badge variant="secondary" className="text-xs">
                {[
                  autoParameters?.searchDepth,
                  autoParameters?.topic,
                  autoParameters?.timeRange,
                ].filter(Boolean).length}
              </Badge>
            )}
          </div>
          {isOpen
            ? <ChevronUp className="size-4 text-muted-foreground" />
            : <ChevronDown className="size-4 text-muted-foreground" />}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-3">
        <div className="space-y-3 px-3 py-2 rounded-lg bg-muted/20 border border-border/30">
          {/* Search Query */}
          {query && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Globe className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">{t('query')}</span>
              </div>
              <p className="text-sm text-foreground pl-5">
                &quot;
                {query}
                &quot;
              </p>
            </div>
          )}

          {query && hasParameters && <Separator />}

          {/* Auto-detected Parameters */}
          {hasParameters && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="size-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">{t('autoDetected')}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-5">
                {/* Search Depth */}
                {autoParameters.searchDepth && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Layers className="size-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{t('depth.label')}</span>
                    </div>
                    <Badge
                      variant={autoParameters.searchDepth === 'advanced' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {autoParameters.searchDepth === 'advanced'
                        ? t('depth.advanced')
                        : t('depth.basic')}
                    </Badge>
                  </div>
                )}

                {/* Topic */}
                {autoParameters.topic && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Target className="size-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{t('topic.label')}</span>
                    </div>
                    <Badge variant="outline" className="text-xs capitalize">
                      {autoParameters.topic}
                    </Badge>
                  </div>
                )}

                {/* Time Range */}
                {autoParameters.timeRange && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Clock className="size-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{t('timeRange.label')}</span>
                    </div>
                    <Badge variant="outline" className="text-xs capitalize">
                      {autoParameters.timeRange.replace('_', ' ')}
                    </Badge>
                  </div>
                )}
              </div>

              {/* AI Reasoning */}
              {autoParameters.reasoning && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Lightbulb className="size-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">{t('reasoning')}</span>
                    </div>
                    <p className="text-xs text-foreground/80 leading-relaxed pl-4.5 italic">
                      {autoParameters.reasoning}
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
