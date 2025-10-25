'use client';
import { cn } from '@/lib/ui/cn';

export type StatusIndicatorStatus = 'idle' | 'streaming' | 'error' | 'success';
export type StatusIndicatorProps = {
  'status': StatusIndicatorStatus;
  'size'?: 'sm' | 'md' | 'lg';
  'className'?: string;
  'aria-label'?: string;
};
const sizeClasses = {
  sm: 'size-2',
  md: 'size-2.5',
  lg: 'size-3',
};
const statusClasses = {
  idle: 'bg-muted-foreground/40',
  streaming: 'bg-primary',
  error: 'bg-destructive',
  success: 'bg-chart-3',
};
export function StatusIndicator({
  status,
  size = 'sm',
  className,
  'aria-label': ariaLabel,
}: StatusIndicatorProps) {
  const isPulsing = status === 'streaming' || status === 'error';
  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      role="status"
      aria-label={ariaLabel || `Status: ${status}`}
    >
      {isPulsing && (
        <span
          className={cn(
            'absolute inline-flex rounded-full opacity-75 animate-ping',
            sizeClasses[size],
            statusClasses[status],
          )}
          aria-hidden="true"
        />
      )}
      <span
        className={cn(
          'relative inline-flex rounded-full',
          sizeClasses[size],
          statusClasses[status],
        )}
        aria-hidden="true"
      />
    </div>
  );
}
