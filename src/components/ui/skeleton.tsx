"use client";

import type { ComponentProps } from 'react';
import { useState } from 'react';

import { cn } from "@/lib/ui/cn"

function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-xl", className)}
      {...props}
    />
  )
}

// Enhanced skeleton patterns for complex layouts
function CardSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("rounded-2xl border bg-card p-6 space-y-4", className)} {...props}>
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
    <div className={cn("rounded-2xl border bg-card p-6", className)} {...props}>
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
    <div className={cn("rounded-2xl border bg-card p-6", className)} {...props}>
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
    <div className={cn("rounded-2xl border bg-card p-6 space-y-4", className)} {...props}>
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
    <div className={cn("rounded-2xl border bg-card", className)} {...props}>
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
      <div className="px-6 py-4 bg-accent/50 rounded-b-2xl">
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

/**
 * Summary card skeleton - matches RoundSummaryCard ChainOfThought style
 * Reusable across thread and public loading pages
 */
function SummaryCardSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("mt-6", className)} {...props}>
      <div className="rounded-2xl bg-card/50 backdrop-blur-sm p-4 space-y-4 border border-white/5">
        {/* Summary header */}
        <div className="flex items-center gap-2">
          <Skeleton className="size-4 rounded bg-white/15" />
          <Skeleton className="h-4 w-32 bg-white/15" />
          <Skeleton className="h-6 w-20 rounded-full bg-white/10" />
        </div>
        {/* Leaderboard skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-4 w-24 bg-white/15" />
          <div className="space-y-1.5">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-3 w-6 bg-white/10" />
                <Skeleton className="h-3 w-full bg-white/10" />
                <Skeleton className="h-3 w-12 bg-white/10" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Sticky input skeleton - matches the sticky chat input container
 * Reusable across overview and thread loading pages
 */
function StickyInputSkeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-30 mt-auto",
        "bg-gradient-to-t from-background via-background to-transparent pt-6",
        className
      )}
      {...props}
    >
      <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 md:px-6">
        <div className="rounded-2xl bg-card border border-white/[0.12] shadow-lg p-4">
          <Skeleton className="h-12 w-full bg-white/10 rounded-xl" />
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-6 rounded bg-white/10" />
              <Skeleton className="size-6 rounded bg-white/10" />
            </div>
            <Skeleton className="size-8 rounded-full bg-white/15" />
          </div>
        </div>
      </div>
      {/* Bottom safe area fill */}
      <div className="h-4 bg-background" />
    </div>
  )
}

/**
 * Thread messages skeleton - user message + AI responses + summary
 * Reusable pattern for chat thread loading states
 */
function ThreadMessagesSkeleton({
  participantCount = 2,
  showSummary = true,
  className,
  ...props
}: {
  participantCount?: number;
  showSummary?: boolean;
} & React.ComponentProps<"div">) {
  return (
    <div className={cn("space-y-3", className)} {...props}>
      <UserMessageSkeleton />
      {Array.from({ length: participantCount }, (_, i) => (
        <AssistantMessageSkeleton key={i} />
      ))}
      {showSummary && <SummaryCardSkeleton />}
    </div>
  )
}

/**
 * Quick start cards skeleton - matches ChatQuickStart vertical list
 * Reusable for overview loading page
 */
function QuickStartSkeleton({ count = 3, className, ...props }: { count?: number } & React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col", className)} {...props}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`px-4 py-3 ${i < count - 1 ? 'border-b border-white/[0.06]' : ''}`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
            {/* Question skeleton */}
            <Skeleton className="h-4 sm:h-5 w-full sm:w-3/4 bg-white/15" />
            {/* Mode badge + avatars */}
            <div className="flex items-center gap-2 shrink-0">
              <Skeleton className="h-6 w-16 rounded-2xl bg-white/10" />
              <div className="flex items-center">
                <div className="flex -space-x-2">
                  <Skeleton className="size-6 rounded-full bg-white/15 relative z-[3]" />
                  <Skeleton className="size-6 rounded-full bg-white/15 relative z-[2]" />
                  <Skeleton className="size-6 rounded-full bg-white/15 relative z-[1]" />
                </div>
                <Skeleton className="size-6 rounded-full bg-white/30 ml-2" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Image with skeleton loading - prevents CLS with fixed dimensions
 * Shows skeleton while image loads, fades in when ready
 */
function ImageWithSkeleton({
  src,
  alt,
  width,
  height,
  className,
  skeletonClassName,
  ...props
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  skeletonClassName?: string;
} & Omit<ComponentProps<"img">, "src" | "alt" | "width" | "height">) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div
      className="relative"
      style={{ width, height }}
    >
      {/* Skeleton placeholder - always rendered to reserve space */}
      {!isLoaded && !hasError && (
        <Skeleton
          className={cn("absolute inset-0", skeletonClassName)}
          style={{ width, height }}
        />
      )}
      {/* Actual image */}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        className={cn(
          "transition-opacity duration-300",
          isLoaded ? "opacity-100" : "opacity-0",
          className
        )}
        {...props}
      />
    </div>
  );
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
  AssistantMessageSkeleton,
  SummaryCardSkeleton,
  StickyInputSkeleton,
  ThreadMessagesSkeleton,
  QuickStartSkeleton,
  ImageWithSkeleton,
}

