"use client"

/**
 * Avatar Component with Performance Optimizations
 *
 * ✅ Lazy Loading: All images are lazy loaded by default for optimal performance
 * ✅ Fallback Support: Displays fallback content while images load
 * ✅ Accessibility: Proper ARIA attributes and alt text support
 *
 * Used throughout the application for:
 * - AI model provider icons (32+ models in dropdowns)
 * - User profile avatars
 * - Message sender avatars
 *
 * Performance Impact:
 * - Reduces initial page load by deferring off-screen images
 * - Improves scrolling performance in long lists (e.g., model dropdowns)
 * - Native browser lazy loading - no JavaScript overhead
 */

import * as AvatarPrimitive from "@radix-ui/react-avatar"
import * as React from "react"

import { cn } from "@/lib/ui/cn"

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    />
  )
}

/**
 * Avatar Image with Lazy Loading
 *
 * @param loading - Controls image loading behavior (default: "lazy")
 *   - "lazy": Defers loading until image is near viewport (recommended)
 *   - "eager": Loads immediately (use only for above-the-fold content)
 *
 * Native lazy loading is enabled by default for optimal performance,
 * especially in scrollable lists with many images (e.g., model dropdowns).
 */
function AvatarImage({
  className,
  loading = "lazy", // Default to lazy loading for performance
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image> & {
  loading?: "lazy" | "eager";
}) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      loading={loading}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted flex size-full items-center justify-center rounded-full",
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarFallback, AvatarImage }

