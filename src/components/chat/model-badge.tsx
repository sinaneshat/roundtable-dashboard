'use client';

import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/ui/cn';
import { extractModelName, getModelIconInfo } from '@/lib/utils';

/**
 * ModelBadge Component
 *
 * Compact display-only model badge showing avatar with model icon and model name.
 * Reusable component for displaying model information without selection logic.
 *
 * @example
 * ```tsx
 * <ModelBadge modelId="anthropic/claude-sonnet-4.5" />
 * <ModelBadge modelId="openai/gpt-4" role="Devil's Advocate" size="md" />
 * ```
 */

const modelBadgeVariants = cva(
  'flex items-center gap-2 rounded-full border border-border/50 bg-muted/30',
  {
    variants: {
      size: {
        sm: 'px-2 py-1.5',
        md: 'px-3 py-2',
      },
    },
    defaultVariants: {
      size: 'sm',
    },
  },
);

const avatarSizeVariants = {
  sm: 'size-5',
  md: 'size-6',
} as const;

const textSizeVariants = {
  sm: 'text-xs',
  md: 'text-sm',
} as const;

const roleTextSizeVariants = {
  sm: 'text-[10px]',
  md: 'text-[11px]',
} as const;

export type ModelBadgeProps = VariantProps<typeof modelBadgeVariants> & {
  /** OpenRouter model ID (e.g., "anthropic/claude-sonnet-4.5") */
  modelId: string;
  /** Optional role label to display below model name */
  role?: string;
  /** Additional CSS classes */
  className?: string;
};

export function ModelBadge({
  modelId,
  role,
  size = 'sm',
  className,
}: ModelBadgeProps) {
  const { icon, providerName } = getModelIconInfo(modelId);
  const modelName = extractModelName(modelId);

  return (
    <div className={cn(modelBadgeVariants({ size }), className)}>
      <Avatar className={cn('flex-shrink-0', avatarSizeVariants[size || 'sm'])}>
        <AvatarImage src={icon} alt={modelName} />
        <AvatarFallback className="text-[10px]">
          {providerName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col min-w-0 flex-1">
        <span className={cn('font-medium truncate', textSizeVariants[size || 'sm'])}>
          {modelName}
        </span>
        {role && (
          <span className={cn('text-muted-foreground truncate', roleTextSizeVariants[size || 'sm'])}>
            Role:
            {' '}
            {role}
          </span>
        )}
      </div>
    </div>
  );
}
