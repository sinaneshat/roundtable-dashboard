import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/ui/cn';

/**
 * AuthFormSkeleton - Reusable skeleton for authentication forms
 *
 * Matches the structure of sign-in/sign-up forms with OAuth buttons.
 * Used during authentication loading states.
 */
export function AuthFormSkeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('w-full flex flex-col gap-4 pt-10', className)} {...props}>
      <Skeleton className="h-12 w-full rounded-full" />
      <Skeleton className="h-12 w-full rounded-full" />
    </div>
  );
}
