import { cn } from '@/lib/ui/cn';

import { Spinner } from './spinner';

type LoadingSpinnerProps = {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  text?: string;
};

const sizeClasses = {
  sm: 'size-4',
  md: 'size-8',
  lg: 'size-12',
};

/**
 * LoadingSpinner - Spinner with optional text label
 *
 * Uses the base Spinner component with added text support.
 * For simple spinners without text, use <Spinner /> directly.
 */
export function LoadingSpinner({ className, size = 'md', text }: LoadingSpinnerProps) {
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
