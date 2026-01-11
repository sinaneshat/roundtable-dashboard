import type { ComponentProps } from 'react';

import { Icons } from '@/components/icons';
import { cn } from '@/lib/ui/cn';

function Spinner({ className, ...props }: ComponentProps<'svg'>) {
  return (
    <Icons.loader
      role="status"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
