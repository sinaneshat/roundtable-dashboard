import { useState } from 'react';
import { useFormContext } from 'react-hook-form';

import { FormControl, FormField, FormItem, FormMessage } from '@/components/forms';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

import type { TrendDiscoveryFormValues } from './trend-discovery-dialog';

type TrendSuggestionCardProps = {
  index: number;
  disabled?: boolean;
};

const PLATFORM_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  reddit: Icons.reddit,
  twitter: Icons.twitter,
  instagram: Icons.instagram,
};

const PLATFORM_COLORS: Record<string, string> = {
  reddit: 'bg-orange-500/10 text-orange-600',
  twitter: 'bg-blue-400/10 text-blue-500',
  instagram: 'bg-pink-500/10 text-pink-600',
};

export function TrendSuggestionCard({ index, disabled }: TrendSuggestionCardProps) {
  const t = useTranslations();
  const [showReasoning, setShowReasoning] = useState(false);
  const { control, watch } = useFormContext<TrendDiscoveryFormValues>();

  const suggestion = watch(`suggestions.${index}`);
  const isSelected = suggestion?.selected ?? false;

  const PlatformIcon = PLATFORM_ICONS[suggestion?.platform] ?? Icons.globe;
  const platformColor = PLATFORM_COLORS[suggestion?.platform] ?? 'bg-muted text-muted-foreground';

  const relevanceColor = (suggestion?.relevanceScore ?? 0) >= 80
    ? 'text-emerald-500'
    : (suggestion?.relevanceScore ?? 0) >= 50
        ? 'text-amber-500'
        : 'text-muted-foreground';

  const checkboxId = `trend-${index}`;

  return (
    <div className={cn(
      'rounded-lg border border-border p-4 space-y-3 transition-colors',
      isSelected && 'border-primary bg-primary/5',
    )}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="flex items-center h-5 pt-0.5">
          <FormField
            control={control}
            name={`suggestions.${index}.selected`}
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Checkbox
                    id={checkboxId}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={disabled}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        <div className="flex-1 space-y-3">
          {/* Platform & Relevance */}
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={checkboxId} className="flex items-center gap-2 cursor-pointer">
              <Badge variant="secondary" className={cn(platformColor, 'capitalize')}>
                <PlatformIcon className="size-3 mr-1" />
                {suggestion?.platform === 'twitter' ? 'X' : suggestion?.platform}
              </Badge>
              <span className={cn('text-xs', relevanceColor)}>
                {suggestion?.relevanceScore}
                %
              </span>
            </Label>
          </div>

          {/* Topic */}
          <p className="font-medium text-sm">{suggestion?.topic}</p>

          {/* Editable Prompt */}
          <FormField
            control={control}
            name={`suggestions.${index}.prompt`}
            render={({ field }) => (
              <FormItem className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  {t('admin.jobs.trends.editPrompt')}
                </label>
                <FormControl>
                  <Textarea
                    {...field}
                    className="min-h-20 resize-none text-sm"
                    placeholder={t('admin.jobs.new.promptPlaceholder')}
                    disabled={disabled}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Rounds Selector */}
          <FormField
            control={control}
            name={`suggestions.${index}.rounds`}
            render={({ field }) => (
              <FormItem className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground whitespace-nowrap">
                  {t('admin.jobs.trends.suggestedRounds')}
                  :
                </label>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={field.value}
                    onChange={(e) => {
                      const val = Math.min(5, Math.max(1, Number.parseInt(e.target.value, 10) || 1));
                      field.onChange(val);
                    }}
                    className="w-16 h-8 text-sm"
                    disabled={disabled}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Reasoning Collapsible */}
          <Collapsible open={showReasoning} onOpenChange={setShowReasoning}>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showReasoning
                  ? <Icons.chevronUp className="size-3 mr-1" />
                  : <Icons.chevronDown className="size-3 mr-1" />}
                {t('admin.jobs.trends.reasoning')}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                {suggestion?.reasoning}
              </p>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}
