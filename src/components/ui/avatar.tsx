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

import type { ComponentPropsWithoutRef, ElementRef, HTMLAttributeReferrerPolicy } from 'react';
import { forwardRef } from 'react';

import * as AvatarPrimitive from "@radix-ui/react-avatar"

import type { ImageLoading } from '@/api/core/enums';
import { ImageLoadings } from '@/api/core/enums';
import { cn } from "@/lib/ui/cn"

const Avatar = forwardRef<
  ElementRef<typeof AvatarPrimitive.Root>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    data-slot="avatar"
    className={cn(
      "relative flex size-8 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  />
))

Avatar.displayName = AvatarPrimitive.Root.displayName

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
interface AvatarImageProps extends ComponentPropsWithoutRef<typeof AvatarPrimitive.Image> {
  loading?: ImageLoading;
  referrerPolicy?: HTMLAttributeReferrerPolicy;
}

const AvatarImage = forwardRef<
  ElementRef<typeof AvatarPrimitive.Image>,
  AvatarImageProps
>(({ className, loading = ImageLoadings.LAZY, referrerPolicy = "no-referrer", ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    data-slot="avatar-image"
    className={cn("aspect-square size-full", className)}
    loading={loading}
    referrerPolicy={referrerPolicy}
    {...props}
  />
))

AvatarImage.displayName = AvatarPrimitive.Image.displayName

const AvatarFallback = forwardRef<
  ElementRef<typeof AvatarPrimitive.Fallback>,
  ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    data-slot="avatar-fallback"
    className={cn(
      "bg-muted flex size-full items-center justify-center rounded-full",
      className
    )}
    {...props}
  />
))

AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarFallback, AvatarImage }
export { LazyAvatarImage } from './lazy-avatar-image'

