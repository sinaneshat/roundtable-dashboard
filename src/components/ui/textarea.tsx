import type { Ref, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/ui/cn';

export type TextareaProps = {
  ref?: Ref<HTMLTextAreaElement>;
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

function Textarea({ className, ref, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}

Textarea.displayName = 'Textarea';

export { Textarea };

