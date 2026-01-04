import type { ComponentProps, ReactNode } from 'react';
import { forwardRef } from 'react';

import { Slot } from "@/lib/ui/slot"
import { cva, type VariantProps } from "class-variance-authority"

import { Icons } from "@/components/icons"
import { cn } from "@/lib/ui/cn"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-white/[0.07] hover:text-accent-foreground dark:bg-input/30 dark:border-input",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-white/[0.07] hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        white:
          "bg-white text-black shadow-xs hover:bg-white/90",
        success:
          "bg-emerald-600 text-white shadow-xs hover:bg-emerald-600/90 focus-visible:ring-emerald-600/20 dark:focus-visible:ring-emerald-600/40",
        warning:
          "bg-amber-600 text-white shadow-xs hover:bg-amber-600/90 focus-visible:ring-amber-600/20 dark:focus-visible:ring-amber-600/40",
        glass:
          "bg-white/5 backdrop-blur-md border border-white/10 shadow-xs hover:bg-white/[0.07]",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        md: "h-9 px-4 has-[>svg]:px-3",
        lg: "h-11 px-6 has-[>svg]:px-4",
        xl: "h-12 px-8 has-[>svg]:px-5",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonBaseProps = ComponentProps<"button">;
type ButtonVariantProps = VariantProps<typeof buttonVariants>;

interface ButtonProps extends ButtonBaseProps, ButtonVariantProps {
  asChild?: boolean
  loading?: boolean
  loadingText?: string
  startIcon?: ReactNode
  endIcon?: ReactNode
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
    const isDisabled = disabled || loading
    const buttonChildren = loading && loadingText ? loadingText : children

    // When asChild, pass children directly so Slot can merge props onto the single child
    if (asChild) {
      return (
        <Slot
          ref={ref}
          data-slot="button"
          className={cn(buttonVariants({ variant, size, className }))}
          {...props}
        >
          {children}
        </Slot>
      )
    }

    return (
      <button
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={isDisabled}
        aria-busy={loading}
        aria-describedby={loading ? "button-loading" : undefined}
        {...props}
      >
        {loading ? (
          <>
            <Icons.loader className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />
            {buttonChildren}
          </>
        ) : (
          <>
            {startIcon && <span className="inline-flex shrink-0" aria-hidden="true">{startIcon}</span>}
            {buttonChildren}
            {endIcon && <span className="inline-flex shrink-0" aria-hidden="true">{endIcon}</span>}
          </>
        )}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants, type ButtonProps }