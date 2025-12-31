import type { ComponentSize } from '@/api/core/enums';
import { ComponentSizes } from '@/api/core/enums';
import { cn } from '@/lib/ui/cn';

import { Spinner } from './spinner';

type LoadingSpinnerProps = {
  className?: string;
  size?: Extract<ComponentSize, 'sm' | 'md' | 'lg'>;
  text?: string;
};

const sizeClasses = {
  [ComponentSizes.SM]: 'size-4',
  [ComponentSizes.MD]: 'size-8',
  [ComponentSizes.LG]: 'size-12',
} as const;

/**
 * LoadingSpinner - Spinner with optional text label
 *
 * Uses the base Spinner component with added text support.
 * For simple spinners without text, use <Spinner /> directly.
 */
export function LoadingSpinner({ className, size = ComponentSizes.MD, text }: LoadingSpinnerProps) {
  if (!text) {
    return <Spinner className={cn(sizeClasses[size], 'text-primary', className)} />;
  }

  return (
    <div className={cn('flex flex-col items-center justify-center gap-2', className)}>
      <Spinner className={cn(sizeClasses[size], 'text-primary')} />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
