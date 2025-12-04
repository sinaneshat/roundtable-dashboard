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

import type { ComponentProps, HTMLAttributeReferrerPolicy } from 'react';

import * as AvatarPrimitive from "@radix-ui/react-avatar"

import { cn } from "@/lib/ui/cn"

function Avatar({
  className,
  ...props
}: ComponentProps<typeof AvatarPrimitive.Root>) {
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
 * @param referrerPolicy - Controls referrer header sent with image requests
 *   - "no-referrer": Prevents hotlink protection blocking (default for external images)
 *
 * Native lazy loading is enabled by default for optimal performance,
 * especially in scrollable lists with many images (e.g., model dropdowns).
 */
function AvatarImage({
  className,
  loading = "lazy", // Default to lazy loading for performance
  referrerPolicy = "no-referrer", // Bypass hotlink protection for external images
  ...props
}: ComponentProps<typeof AvatarPrimitive.Image> & {
  loading?: "lazy" | "eager";
  referrerPolicy?: HTMLAttributeReferrerPolicy;
}) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full", className)}
      loading={loading}
      referrerPolicy={referrerPolicy}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: ComponentProps<typeof AvatarPrimitive.Fallback>) {
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

