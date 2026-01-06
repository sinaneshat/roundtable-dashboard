import type { ComponentProps, ReactNode } from 'react';
import { forwardRef } from 'react';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { ComponentSizes, ComponentVariants, type ComponentVariant, type ComponentSize } from '@/api/core/enums';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/ui/cn';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive overflow-hidden",
  {
    variants: {
      variant: {
        [ComponentVariants.DEFAULT]:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        [ComponentVariants.DESTRUCTIVE]:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        [ComponentVariants.OUTLINE]:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-white/15",
        [ComponentVariants.SECONDARY]:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        [ComponentVariants.GHOST]:
          "hover:bg-white/10 hover:text-accent-foreground",
        [ComponentVariants.LINK]: "text-primary underline-offset-4 hover:underline",
        [ComponentVariants.WHITE]:
          "bg-white text-black shadow-xs hover:bg-white/90",
        [ComponentVariants.SUCCESS]:
          "bg-emerald-600 text-white shadow-xs hover:bg-emerald-600/90 focus-visible:ring-emerald-600/20 dark:focus-visible:ring-emerald-600/40",
        [ComponentVariants.WARNING]:
          "bg-amber-600 text-white shadow-xs hover:bg-amber-600/90 focus-visible:ring-amber-600/20 dark:focus-visible:ring-amber-600/40",
        [ComponentVariants.GLASS]:
          "bg-white/5 backdrop-blur-md border border-white/10 shadow-xs hover:bg-white/10",
      } satisfies Record<ComponentVariant, string>,
      size: {
        [ComponentSizes.DEFAULT]: "h-9 px-4 py-2 has-[>svg]:px-3",
        [ComponentSizes.SM]: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        [ComponentSizes.MD]: "h-9 px-4 has-[>svg]:px-3",
        [ComponentSizes.LG]: "h-11 px-6 has-[>svg]:px-4",
        [ComponentSizes.XL]: "h-12 px-8 has-[>svg]:px-5",
        [ComponentSizes.ICON]: "size-9",
      } satisfies Record<ComponentSize, string>,
    },
    defaultVariants: {
      variant: ComponentVariants.DEFAULT,
      size: ComponentSizes.DEFAULT,
    },
  }
)

interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  loadingText?: string;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    className,
    variant,
    size,
    asChild = false,
    loading = false,
    loadingText,
    startIcon,
    endIcon,
    children,
    disabled,
    ...props
  }, ref) => {
    const Comp = asChild ? Slot : 'button';

    const isDisabled = disabled || loading;
    const buttonChildren: ReactNode = loading && loadingText ? loadingText : children;

    return (
      <Comp
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={isDisabled}
        aria-busy={loading}
        aria-describedby={loading ? 'button-loading' : undefined}
        {...props}
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Icons.loader className="h-4 w-4 animate-spin" aria-hidden="true" />
            {buttonChildren}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            {startIcon && <span className="inline-flex items-center shrink-0" aria-hidden="true">{startIcon}</span>}
            {buttonChildren}
            {endIcon && <span className="inline-flex items-center shrink-0" aria-hidden="true">{endIcon}</span>}
          </span>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants, type ButtonProps };