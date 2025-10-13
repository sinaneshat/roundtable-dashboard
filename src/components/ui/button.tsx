import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/ui/cn"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Enhanced Button component following shadcn/ui v4 best practices
 * 
 * Features:
 * - Built-in loading state with spinner animation
 * - Start and end icon support with consistent spacing
 * - Custom loading text support
 * - Proper accessibility attributes (aria-busy, aria-describedby)
 * - Maintains spacing consistency during state transitions
 * - Full backward compatibility with existing usage
 * - Support for all shadcn button variants and sizes
 * - Automatic disabled state when loading
 * - Proper shrink-0 classes for icon consistency
 * 
 * @example
 * // Basic usage
 * <Button>Click me</Button>
 * 
 * // With loading state
 * <Button loading>Processing...</Button>
 * 
 * // With custom loading text
 * <Button loading loadingText="Saving...">Save Document</Button>
 * 
 * // With icons
 * <Button startIcon={<Save />}>Save</Button>
 * <Button endIcon={<ArrowRight />}>Continue</Button>
 * 
 * // Combined features
 * <Button loading variant="secondary" size="lg">Loading...</Button>
 */
interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /** Render as child component using Radix Slot */
  asChild?: boolean
  /** Show loading spinner and disable button */
  loading?: boolean
  /** Custom text to show when loading (overrides children) */
  loadingText?: string
  /** Icon to display at the start of the button */
  startIcon?: React.ReactNode
  /** Icon to display at the end of the button */
  endIcon?: React.ReactNode
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
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
    const Comp = asChild ? Slot : "button"

    const isDisabled = disabled || loading
    const buttonChildren = loading && loadingText ? loadingText : children

    return (
      <Comp
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
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {buttonChildren}
          </>
        ) : (
          <>
            {startIcon && <span className="inline-flex items-center shrink-0" aria-hidden="true">{startIcon}</span>}
            {buttonChildren}
            {endIcon && <span className="inline-flex items-center shrink-0" aria-hidden="true">{endIcon}</span>}
          </>
        )}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants, type ButtonProps }