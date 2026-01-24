import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

import { FormProvider } from '@/components/forms';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useCreateJobMutation, useDiscoverTrendsMutation } from '@/hooks/mutations';
import { useTranslations } from '@/lib/i18n';
import { toastManager } from '@/lib/toast';
import type { TrendSuggestion } from '@/services/api';

import { TrendSuggestionCard } from './trend-suggestion-card';

const PLATFORMS = ['reddit', 'twitter', 'instagram'] as const;
type Platform = (typeof PLATFORMS)[number];

const SuggestionItemSchema = z.object({
  topic: z.string(),
  platform: z.enum(PLATFORMS),
  relevanceScore: z.number(),
  reasoning: z.string(),
  prompt: z.string().min(10, 'Prompt must be at least 10 characters').max(2000),
  rounds: z.number().min(1).max(5),
  selected: z.boolean(),
});

const TrendDiscoveryFormSchema = z.object({
  keyword: z.string().min(2, 'Enter at least 2 characters').max(100),
  platforms: z.array(z.enum(PLATFORMS)).min(1, 'Select at least one platform'),
  suggestions: z.array(SuggestionItemSchema),
});

type TrendDiscoveryFormValues = z.infer<typeof TrendDiscoveryFormSchema>;

export type { TrendDiscoveryFormValues };

type TrendDiscoveryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const PLATFORM_CONFIG: { id: Platform; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'reddit', label: 'Reddit', icon: Icons.reddit },
  { id: 'twitter', label: 'X', icon: Icons.twitter },
  { id: 'instagram', label: 'Instagram', icon: Icons.instagram },
];

export function TrendDiscoveryDialog({ open, onOpenChange }: TrendDiscoveryDialogProps) {
  const t = useTranslations();
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  const discoverMutation = useDiscoverTrendsMutation();
  const createJobMutation = useCreateJobMutation();

  const methods = useForm<TrendDiscoveryFormValues>({
    resolver: zodResolver(TrendDiscoveryFormSchema),
    defaultValues: {
      keyword: '',
      platforms: ['reddit', 'twitter'],
      suggestions: [],
    },
    mode: 'onChange',
  });

  const { fields, replace } = useFieldArray({
    control: methods.control,
    name: 'suggestions',
  });

  const keyword = methods.watch('keyword');
  const platforms = methods.watch('platforms');
  const suggestions = methods.watch('suggestions');
  const hasSearched = discoverMutation.isSuccess || fields.length > 0;
  const selectedCount = suggestions.filter(s => s.selected).length;

  useEffect(() => {
    if (open) {
      methods.reset({
        keyword: '',
        platforms: ['reddit', 'twitter'],
        suggestions: [],
      });
      discoverMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset functions are stable
  }, [open]);

  const handlePlatformToggle = (platform: Platform) => {
    const current = methods.getValues('platforms');
    const updated = current.includes(platform)
      ? current.filter(p => p !== platform)
      : [...current, platform];
    methods.setValue('platforms', updated, { shouldValidate: true });
  };

  const handleDiscover = () => {
    const values = methods.getValues();
    if (values.keyword.trim().length < 2 || values.platforms.length === 0)
      return;

    discoverMutation.mutate(
      {
        json: {
          keyword: values.keyword.trim(),
          platforms: values.platforms,
          maxSuggestions: 5,
        },
      },
      {
        onSuccess: (response) => {
          if (response.success) {
            replace(
              response.data.suggestions.map((s: TrendSuggestion) => ({
                topic: s.topic,
                platform: s.platform as Platform,
                relevanceScore: s.relevanceScore,
                reasoning: s.reasoning,
                prompt: s.prompt,
                rounds: s.suggestedRounds,
                selected: false,
              })),
            );
          }
        },
      },
    );
  };

  const handleSelectAll = () => {
    const current = methods.getValues('suggestions');
    methods.setValue(
      'suggestions',
      current.map(s => ({ ...s, selected: true })),
    );
  };

  const handleDeselectAll = () => {
    const current = methods.getValues('suggestions');
    methods.setValue(
      'suggestions',
      current.map(s => ({ ...s, selected: false })),
    );
  };

  const handleCreateSelectedJobs = async () => {
    const values = methods.getValues();
    const selected = values.suggestions.filter(s => s.selected && s.prompt.trim().length >= 10);
    if (selected.length === 0)
      return;

    setIsCreatingBatch(true);
    setBatchProgress({ current: 0, total: selected.length });
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < selected.length; i++) {
      const item = selected[i];
      if (!item)
        continue;
      setBatchProgress({ current: i + 1, total: selected.length });
      try {
        await new Promise<void>((resolve, reject) => {
          createJobMutation.mutate(
            {
              json: {
                initialPrompt: item.prompt,
                totalRounds: item.rounds,
                autoPublish: false,
              },
            },
            {
              onSuccess: (response) => {
                if (response.success)
                  successCount++;
                resolve();
              },
              onError: err => reject(err),
            },
          );
        });
      } catch {
        errorCount++;
      }
    }

    setIsCreatingBatch(false);
    setBatchProgress({ current: 0, total: 0 });

    if (successCount > 0) {
      toastManager.success(t('admin.jobs.trends.batchCreated', { count: successCount }));
      onOpenChange(false);
    } else if (errorCount > 0) {
      toastManager.error(t('admin.jobs.trends.batchErrors', { count: errorCount }));
      methods.setValue(
        'suggestions',
        values.suggestions.map(s => ({ ...s, selected: false })),
      );
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isCreatingBatch)
      return;
    onOpenChange(isOpen);
  };

  const canSearch = keyword.trim().length >= 2 && platforms.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icons.search className="size-5" />
            {t('admin.jobs.trends.title')}
          </DialogTitle>
          <DialogDescription>
            {t('admin.jobs.trends.description')}
          </DialogDescription>
        </DialogHeader>

        <FormProvider methods={methods} className="flex flex-col flex-1 min-h-0">
          <DialogBody>
            <div className="space-y-4">
              {/* Keyword Input */}
              <FormField
                control={methods.control}
                name="keyword"
                render={({ field }) => (
                  <FormItem>
                    <Label htmlFor="keyword">{t('admin.jobs.trends.keywordLabel')}</Label>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          {...field}
                          id="keyword"
                          placeholder={t('admin.jobs.trends.keywordPlaceholder')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && canSearch) {
                              e.preventDefault();
                              handleDiscover();
                            }
                          }}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        onClick={handleDiscover}
                        disabled={!canSearch || discoverMutation.isPending}
                        loading={discoverMutation.isPending}
                        loadingText={t('admin.jobs.trends.discovering')}
                        startIcon={<Icons.search />}
                      >
                        {t('admin.jobs.trends.discover')}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Platform Checkboxes */}
              <FormField
                control={methods.control}
                name="platforms"
                render={() => (
                  <FormItem>
                    <Label>{t('admin.jobs.trends.platforms')}</Label>
                    <div className="flex gap-4">
                      {PLATFORM_CONFIG.map((platform) => {
                        const PlatformIcon = platform.icon;
                        const isChecked = platforms.includes(platform.id);
                        return (
                          <div key={platform.id} className="flex items-center gap-1.5">
                            <Checkbox
                              id={platform.id}
                              checked={isChecked}
                              onCheckedChange={() => handlePlatformToggle(platform.id)}
                            />
                            <Label htmlFor={platform.id} className="text-sm cursor-pointer flex items-center gap-1">
                              <PlatformIcon className="size-3.5" />
                              {platform.label}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Discovery Error */}
              {discoverMutation.isError && (
                <Alert variant="destructive">
                  <Icons.alertCircle className="size-4" />
                  <AlertTitle>{t('admin.jobs.trends.discoveryError')}</AlertTitle>
                  <AlertDescription>{discoverMutation.error?.message}</AlertDescription>
                </Alert>
              )}

              {/* Loading Skeletons */}
              {discoverMutation.isPending && (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="rounded-lg border border-border p-4 space-y-3">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-16 w-full" />
                      <div className="flex gap-2">
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-8 w-24 ml-auto" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* No Results */}
              {!discoverMutation.isPending && hasSearched && fields.length === 0 && (
                <div className="text-center py-8">
                  <Icons.search className="size-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground text-sm">
                    {t('admin.jobs.trends.noResults')}
                  </p>
                </div>
              )}

              {/* Results */}
              {!discoverMutation.isPending && fields.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b">
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={handleSelectAll}>
                        {t('admin.jobs.trends.selectAll')}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={handleDeselectAll}>
                        {t('admin.jobs.trends.deselectAll')}
                      </Button>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {t('admin.jobs.trends.selectedCount', { count: selectedCount })}
                    </span>
                  </div>

                  {fields.map((field, index) => (
                    <TrendSuggestionCard
                      key={field.id}
                      index={index}
                      disabled={isCreatingBatch}
                    />
                  ))}
                </div>
              )}
            </div>
          </DialogBody>

          {fields.length > 0 && selectedCount > 0 && (
            <DialogFooter bordered>
              <Button
                type="button"
                onClick={handleCreateSelectedJobs}
                disabled={isCreatingBatch || selectedCount === 0}
                className="w-full"
                loading={isCreatingBatch}
                startIcon={<Icons.sparkles />}
              >
                {isCreatingBatch
                  ? t('admin.jobs.trends.creating', { current: batchProgress.current, total: batchProgress.total })
                  : t('admin.jobs.trends.createSelected', { count: selectedCount })}
              </Button>
            </DialogFooter>
          )}
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
