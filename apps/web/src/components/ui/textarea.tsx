import type { Ref, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/ui/cn';

export type TextareaProps = {
  ref?: Ref<HTMLTextAreaElement>;
} & TextareaHTMLAttributes<HTMLTextAreaElement>;

function Textarea({ className, ref, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-xl border border-input bg-transparent dark:bg-input/30 px-3 py-2 text-sm shadow-xs transition-[color,border-color,box-shadow] outline-none placeholder:text-muted-foreground',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:pointer-events-none',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}

Textarea.displayName = 'Textarea';

export { Textarea };
