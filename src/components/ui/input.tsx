import * as React from "react"

import { cn } from "@/lib/ui/cn"

/**
 * Enhanced Input component following shadcn/ui v4 best practices
 *
 * Production-ready features:
 * - Start and end icon support with consistent spacing
 * - Proper icon positioning and styling
 * - Maintains all standard input functionality
 * - Compatible with React Hook Form
 * - Automatic padding adjustment for icons
 * - Clickable end icons for clear buttons and actions
 *
 * @example
 * // Basic usage
 * <Input placeholder="Enter text" />
 *
 * // With start icon (e.g., search)
 * <Input startIcon={<Search />} placeholder="Search..." />
 *
 * // With clickable end icon (e.g., clear button)
 * <Input
 *   endIcon={<X onClick={() => setValue('')} />}
 *   endIconClickable
 *   placeholder="Filter..."
 * />
 *
 * // With both icons
 * <Input startIcon={<Mail />} endIcon={<Check />} type="email" />
 */
interface InputProps extends React.ComponentProps<"input"> {
  /** Icon to display at the start of the input */
  startIcon?: React.ReactNode
  /** Icon to display at the end of the input */
  endIcon?: React.ReactNode
  /** Allow end icon to be clickable (removes pointer-events-none) */
  endIconClickable?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, startIcon, endIcon, endIconClickable = false, ...props }, ref) => {
    // If no icons, render basic input
    if (!startIcon && !endIcon) {
      return (
        <input
          ref={ref}
          type={type}
          data-slot="input"
          className={cn(
            "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
            className
          )}
          {...props}
        />
      )
    }

    // Render input with icon wrapper
    return (
      <div className="relative w-full">
        {startIcon && (
          <div className="absolute left-3 top-0 bottom-0 flex items-center justify-center pointer-events-none">
            <span className="text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0" aria-hidden="true">
              {startIcon}
            </span>
          </div>
        )}
        <input
          ref={ref}
          type={type}
          data-slot="input"
          className={cn(
            "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
            startIcon && "pl-9",
            endIcon && "pr-9",
            className
          )}
          {...props}
        />
        {endIcon && (
          <div className={cn(
            "absolute right-3 top-0 bottom-0 flex items-center justify-center",
            !endIconClickable && "pointer-events-none"
          )}>
            <span className={cn(
              "text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0",
              endIconClickable && "cursor-pointer hover:text-foreground transition-colors"
            )} aria-hidden={!endIconClickable}>
              {endIcon}
            </span>
          </div>
        )}
      </div>
    )
  }
)

Input.displayName = "Input"

export { Input, type InputProps }

