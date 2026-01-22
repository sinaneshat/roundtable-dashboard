import type { ComponentProps } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';

type BreadcrumbSkeletonProps = {
  count?: number;
} & ComponentProps<'nav'>;

export function BreadcrumbSkeleton({
  count = 2,
  className,
  ...props
}: BreadcrumbSkeletonProps) {
  const t = useTranslations();

  return (
    <nav
      className={cn('flex items-center gap-2', className)}
      aria-label={t('skeletons.loadingBreadcrumb')}
      {...props}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          {i > 0 && <Skeleton className="h-4 w-4" />}
          <Skeleton className={cn('h-4', i === count - 1 ? 'w-32' : 'w-16')} />
        </div>
      ))}
    </nav>
  );
}
