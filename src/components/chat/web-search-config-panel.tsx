'use client';

import { ChevronDown, ChevronUp, Hash, Layers, Settings2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/ui/cn';

type WebSearchConfigPanelProps = {
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  numQueries?: number;
  onConfigChange?: (config: {
    maxResults: number;
    searchDepth: 'basic' | 'advanced';
    numQueries: number;
  }) => void;
  className?: string;
  defaultExpanded?: boolean;
};

export function WebSearchConfigPanel({
  maxResults = 5,
  searchDepth = 'basic',
  numQueries = 3,
  onConfigChange,
  className,
  defaultExpanded = false,
}: WebSearchConfigPanelProps) {
  const t = useTranslations('chat.preSearch.config');
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [localMaxResults, setLocalMaxResults] = useState(maxResults);
  const [localSearchDepth, setLocalSearchDepth] = useState(searchDepth);
  const [localNumQueries, setLocalNumQueries] = useState(numQueries);

  const handleConfigChange = () => {
    onConfigChange?.({
      maxResults: localMaxResults,
      searchDepth: localSearchDepth,
      numQueries: localNumQueries,
    });
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn('rounded-lg border border-border/40 bg-muted/20', className)}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between px-3 py-2 h-auto hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            <Settings2 className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('title')}</span>
            <Badge variant="outline" className="text-xs">
              {localMaxResults}
              {' '}
              results ·
              {localNumQueries}
              {' '}
              queries
            </Badge>
          </div>
          {isOpen
            ? <ChevronUp className="size-4 text-muted-foreground" />
            : <ChevronDown className="size-4 text-muted-foreground" />}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="px-4 py-3 space-y-4">
        {/* Number of Results */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="max-results" className="text-sm font-medium flex items-center gap-1.5">
              <Hash className="size-3.5" />
              {t('numResults')}
            </Label>
            <Badge variant="secondary" className="text-xs">
              {localMaxResults}
            </Badge>
          </div>
          <Input
            id="max-results"
            type="number"
            min={1}
            max={20}
            step={1}
            value={localMaxResults}
            onChange={(e) => {
              const value = Number.parseInt(e.target.value, 10);
              if (!Number.isNaN(value) && value >= 1 && value <= 20) {
                setLocalMaxResults(value);
                handleConfigChange();
              }
            }}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Maximum number of search results per query (1-20)
          </p>
        </div>

        {/* Search Depth */}
        <div className="space-y-2">
          <Label htmlFor="search-depth" className="text-sm font-medium flex items-center gap-1.5">
            <Layers className="size-3.5" />
            {t('searchDepth')}
          </Label>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                {localSearchDepth === 'advanced' ? 'Advanced Search' : 'Basic Search'}
              </span>
              <span className="text-xs text-muted-foreground">
                {localSearchDepth === 'advanced'
                  ? 'Deep research with full content extraction'
                  : 'Fast search with quick snippets'}
              </span>
            </div>
            <Switch
              id="search-depth"
              checked={localSearchDepth === 'advanced'}
              onCheckedChange={(checked) => {
                setLocalSearchDepth(checked ? 'advanced' : 'basic');
                handleConfigChange();
              }}
            />
          </div>
        </div>

        {/* Number of Queries */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="num-queries" className="text-sm font-medium flex items-center gap-1.5">
              <Settings2 className="size-3.5" />
              {t('numQueries')}
            </Label>
            <Badge variant="secondary" className="text-xs">
              {localNumQueries}
            </Badge>
          </div>
          <Input
            id="num-queries"
            type="number"
            min={1}
            max={5}
            step={1}
            value={localNumQueries}
            onChange={(e) => {
              const value = Number.parseInt(e.target.value, 10);
              if (!Number.isNaN(value) && value >= 1 && value <= 5) {
                setLocalNumQueries(value);
                handleConfigChange();
              }
            }}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Number of search queries to generate (1-5)
          </p>
        </div>

        {/* Apply button */}
        <Button
          variant="default"
          size="sm"
          onClick={handleConfigChange}
          className="w-full"
        >
          Apply Configuration
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}
