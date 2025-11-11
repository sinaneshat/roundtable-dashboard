'use client';
import { Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Toggle } from '@/components/ui/toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

type WebSearchToggleProps = {
  enabled: boolean;
  onToggle?: (enabled: boolean) => void;
  className?: string;
  disabled?: boolean;
};

export function WebSearchToggle({
  enabled,
  onToggle,
  className,
  disabled = false,
}: WebSearchToggleProps) {
  const t = useTranslations('chat.webSearch');

  const handleToggle = (pressed: boolean) => {
    if (!disabled && onToggle) {
      onToggle(pressed);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            pressed={enabled}
            onPressedChange={handleToggle}
            disabled={disabled}
            variant="outline"
            size="sm"
            aria-label={t('title')}
            className={cn(
              'size-9 rounded-full p-0',
              enabled && 'bg-primary/10 text-primary border-primary/50 hover:bg-primary/20 data-[state=on]:bg-primary/10 data-[state=on]:text-primary',
              className,
            )}
          >
            <Globe className="size-4" />
          </Toggle>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <div className="font-semibold text-xs">{t('title')}</div>
            <p className="text-xs text-muted-foreground">
              {enabled ? t('description.enabled') : t('description.disabled')}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
