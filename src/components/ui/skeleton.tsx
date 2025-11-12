import { cn } from "@/lib/ui/cn"
import * as React from "react"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  )
}

// Enhanced skeleton patterns for complex layouts
function CardSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("rounded-lg border bg-card p-6 space-y-4", className)} {...props}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="flex items-center space-x-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  )
}

function TableRowSkeleton({ columns = 4, className, ...props }: { columns?: number } & React.ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center space-x-4 p-4 border-b", className)} {...props}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", i === 0 ? "w-48" : "w-24")} />
      ))}
    </div>
  )
}

function StatCardSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("rounded-lg border bg-card p-6", className)} {...props}>
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>
      <Skeleton className="h-8 w-20 mb-2" />
      <div className="flex items-center space-x-2">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  )
}

function ChartSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("rounded-lg border bg-card p-6", className)} {...props}>
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="h-32 w-full bg-accent animate-pulse rounded" />
    </div>
  )
}

function PaymentMethodSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("rounded-lg border bg-card p-6 space-y-4", className)} {...props}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div className="space-y-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>
      <div className="flex items-center justify-between pt-2 border-t">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  )
}

function SubscriptionSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("rounded-lg border bg-card", className)} {...props}>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      </div>
      <div className="px-6 py-4 bg-accent/50 rounded-b-lg">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-24 rounded" />
        </div>
      </div>
    </div>
  )
}

// Chat message skeletons matching simplified design without heavy borders
function UserMessageSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("mb-4 flex justify-end", className)} {...props}>
      <div className="max-w-[80%]">
        {/* Header - simplified without borders, avatar on right */}
        <div className="flex items-center gap-3 py-2 mb-2 flex-row-reverse">
          <Skeleton className="size-8 rounded-full bg-white/15" />
          <Skeleton className="h-5 w-24 bg-white/20" />
        </div>
        {/* Content */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full bg-white/15" />
          <Skeleton className="h-4 w-3/4 bg-white/15" />
        </div>
      </div>
    </div>
  )
}

function AssistantMessageSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("mb-4 flex justify-start", className)} {...props}>
      <div className="max-w-[85%]">
        {/* Header - simplified without borders */}
        <div className="flex items-center gap-3 py-2 mb-2">
          <Skeleton className="size-8 rounded-full bg-white/15" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-32 bg-white/20" />
            <Skeleton className="h-4 w-20 bg-white/15" />
          </div>
        </div>
        {/* Content */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-full bg-white/10" />
          <Skeleton className="h-4 w-full bg-white/10" />
          <Skeleton className="h-4 w-5/6 bg-white/10" />
        </div>
      </div>
    </div>
  )
}

export {
  Skeleton,
  CardSkeleton,
  TableRowSkeleton,
  StatCardSkeleton,
  ChartSkeleton,
  PaymentMethodSkeleton,
  SubscriptionSkeleton,
  UserMessageSkeleton,
  AssistantMessageSkeleton
}

