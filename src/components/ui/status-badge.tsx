'use client'

import * as React from 'react'
import { CheckCircle, Clock, AlertCircle, X } from 'lucide-react'
import { cva } from 'class-variance-authority'
import { useTranslations } from 'next-intl'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/ui/cn'

/**
 * Enhanced Status Badge System following Shadcn/UI v4 patterns
 *
 * Features:
 * - Semantic status mapping for different contexts
 * - Consistent iconography and color schemes
 * - Accessibility attributes and proper ARIA labels
 * - Type-safe status configuration
 */

// Enhanced status configuration with semantic colors
const statusVariants = cva(
  "inline-flex items-center justify-center gap-1 transition-all duration-200",
  {
    variants: {
      status: {
        // Success states
        active: "bg-chart-3/10 text-chart-3 border-chart-3/20 hover:bg-chart-3/10",
        completed: "bg-chart-3/10 text-chart-3 border-chart-3/20 hover:bg-chart-3/10",
        success: "bg-chart-3/10 text-chart-3 border-chart-3/20 hover:bg-chart-3/10",

        // Warning states
        pending: "bg-chart-2/10 text-chart-2 border-chart-2/20 hover:bg-chart-2/10 animate-pulse",
        processing: "bg-primary/10 text-primary border-primary/20 hover:bg-primary/10 dark:text-primary dark:border-primary/20",

        // Error states
        failed: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10",
        canceled: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10",
        expired: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10",
        rejected: "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10",

        // Neutral states
        inactive: "bg-muted text-muted-foreground border-border hover:bg-muted",
        draft: "bg-muted text-muted-foreground border-border hover:bg-muted",

        // Special states
        primary: "bg-primary/10 text-primary border-primary/20 hover:bg-primary/10",
      },
      size: {
        sm: "text-xs px-2 py-0.5 rounded-full",
        md: "text-sm px-2.5 py-0.5 rounded-full",
        lg: "text-sm px-3 py-1 rounded-full",
      }
    },
    defaultVariants: {
      status: "inactive",
      size: "sm",
    }
  }
)

// Icon mapping for different status types
const statusIcons = {
  // Success icons
  active: CheckCircle,
  completed: CheckCircle,
  success: CheckCircle,

  // Warning icons
  pending: Clock,
  processing: Clock,

  // Error icons
  failed: X,
  canceled: X,
  expired: X,
  rejected: X,

  // Neutral icons
  inactive: AlertCircle,
  draft: AlertCircle,

  // Special icons
  primary: CheckCircle,
} as const

const statusBadgePropsSchema = z.object({
  /** Status value to display - accepts any string for backend flexibility */
  status: z.string(),
  /** Size variant */
  size: z.enum(['sm', 'md', 'lg']).optional(),
  /** Show status icon */
  showIcon: z.boolean().optional(),
  /** Icon size override */
  iconSize: z.enum(['sm', 'md', 'lg']).optional(),
  /** Pulse animation for pending states */
  pulse: z.boolean().optional(),
});

export type StatusBadgeProps = z.infer<typeof statusBadgePropsSchema> &
  Omit<React.HTMLAttributes<HTMLSpanElement>, 'variant' | keyof z.infer<typeof statusBadgePropsSchema>> & {
  /** Custom icon component */
  icon?: React.ComponentType<{ className?: string }>
};

/**
 * Enhanced StatusBadge component following Shadcn/UI v4 patterns
 */
export function StatusBadge({
  status,
  showIcon = true,
  iconSize = 'sm',
  icon,
  pulse = false,
  size = 'sm',
  className,
  children,
  ...props
}: StatusBadgeProps) {
  const t = useTranslations('common');
  const normalizedStatus = status.toLowerCase() as keyof typeof statusIcons
  const IconComponent = icon || statusIcons[normalizedStatus] || AlertCircle

  const statusLabel = children || status.charAt(0).toUpperCase() + status.slice(1)

  const iconSizeClass = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-4 w-4',
  }[iconSize]

  const shouldPulse = pulse || normalizedStatus === 'pending' || normalizedStatus === 'processing'

  return (
    <Badge
      variant="outline"
      data-slot="status-badge"
      data-status={normalizedStatus}
      className={cn(
        statusVariants({ status: normalizedStatus, size }),
        shouldPulse && "animate-pulse",
        className
      )}
      role="status"
      aria-label={t('statusLabel', { status: String(statusLabel) })}
      {...props}
    >
      {showIcon && (
        <IconComponent
          className={cn(iconSizeClass, "shrink-0")}
          aria-hidden="true"
        />
      )}
      <span className="font-medium leading-none">
        {statusLabel}
      </span>
    </Badge>
  )
}

// Export variants for external usage
export { statusVariants, type StatusBadgeProps as StatusBadgeVariants }
