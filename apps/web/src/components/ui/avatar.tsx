'use client';

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

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import type { ImageLoading } from '@roundtable/shared';
import { ImageLoadings } from '@roundtable/shared';
import type { ComponentPropsWithoutRef, ElementRef, HTMLAttributeReferrerPolicy } from 'react';

import { cn } from '@/lib/ui/cn';

function Avatar({ ref, className, ...props }: ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & { ref?: React.RefObject<ElementRef<typeof AvatarPrimitive.Root> | null> }) {
  return (
    <AvatarPrimitive.Root
      ref={ref}
      data-slot="avatar"
      className={cn(
        'relative flex size-8 shrink-0 overflow-hidden rounded-full',
        className,
      )}
      {...props}
    />
  );
}

Avatar.displayName = AvatarPrimitive.Root.displayName;

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
type AvatarImageProps = {
  loading?: ImageLoading;
  referrerPolicy?: HTMLAttributeReferrerPolicy;
} & ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>;

function AvatarImage({ ref, className, loading = ImageLoadings.LAZY, referrerPolicy = 'no-referrer', ...props }: AvatarImageProps & { ref?: React.RefObject<ElementRef<typeof AvatarPrimitive.Image> | null> }) {
  return (
    <AvatarPrimitive.Image
      ref={ref}
      data-slot="avatar-image"
      className={cn('aspect-square size-full', className)}
      loading={loading}
      referrerPolicy={referrerPolicy}
      {...props}
    />
  );
}

AvatarImage.displayName = AvatarPrimitive.Image.displayName;

function AvatarFallback({ ref, className, ...props }: ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback> & { ref?: React.RefObject<ElementRef<typeof AvatarPrimitive.Fallback> | null> }) {
  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      data-slot="avatar-fallback"
      className={cn(
        'bg-muted flex size-full items-center justify-center rounded-full',
        // Blur effect for smooth loading transition
        'backdrop-blur-sm animate-pulse',
        className,
      )}
      {...props}
    />
  );
}

AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarFallback, AvatarImage };
