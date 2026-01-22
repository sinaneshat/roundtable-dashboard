import type { ComponentProps, ReactNode, Ref } from 'react';

import { cn } from '@/lib/ui/cn';

type InputProps = {
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  endIconClickable?: boolean;
  ref?: Ref<HTMLInputElement>;
} & Omit<ComponentProps<'input'>, 'ref'>;

function Input({ ref, className, type, startIcon, endIcon, endIconClickable = false, ...props }: InputProps) {
  if (!startIcon && !endIcon) {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-10 sm:h-9 w-full min-w-0 rounded-xl border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,border-color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          className,
        )}
        {...props}
      />
    );
  }

  return (
    <div className="relative w-full">
      {startIcon && (
        <div className="absolute start-2.5 sm:start-3 top-0 bottom-0 flex items-center justify-center pointer-events-none">
          <span className="text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0" aria-hidden="true">
            {startIcon}
          </span>
        </div>
      )}
      <input
        ref={ref}
        type={type}
        className={cn(
          'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-10 sm:h-9 w-full min-w-0 rounded-xl border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,border-color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          startIcon && 'ps-8 sm:ps-9',
          endIcon && 'pe-8 sm:pe-9',
          className,
        )}
        {...props}
      />
      {endIcon && (
        <div className={cn(
          'absolute end-2.5 sm:end-3 top-0 bottom-0 flex items-center justify-center',
          !endIconClickable && 'pointer-events-none',
        )}
        >
          <span
            className={cn(
              'text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0',
              endIconClickable && 'cursor-pointer hover:text-foreground transition-colors',
            )}
            aria-hidden={!endIconClickable}
          >
            {endIcon}
          </span>
        </div>
      )}
    </div>
  );
}

Input.displayName = 'Input';

export { Input, type InputProps };
