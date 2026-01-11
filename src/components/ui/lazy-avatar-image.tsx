'use client';

import type { ComponentPropsWithoutRef, ElementRef } from 'react';
import { forwardRef, memo, useEffect, useRef, useState } from 'react';

import * as AvatarPrimitive from '@radix-ui/react-avatar';

import type { ImageLoading } from '@/api/core/enums';
import { ImageLoadings } from '@/api/core/enums';
import { cn } from '@/lib/ui/cn';

/**
 * Lazy-loaded Avatar Image with IntersectionObserver
 *
 * Optimized for scrollable lists with many avatars:
 * - Defers loading until avatar is near viewport
 * - Uses IntersectionObserver for precise control
 * - Falls back to native lazy loading if IntersectionObserver unavailable
 * - Perfect for message lists with 32+ AI model avatars
 *
 * Performance Impact:
 * - Reduces initial page weight by deferring off-screen images
 * - Prevents layout shift with proper fallback placeholders
 * - Minimal JavaScript overhead with cleanup on unmount
 */
interface LazyAvatarImageProps extends ComponentPropsWithoutRef<typeof AvatarPrimitive.Image> {
  loading?: ImageLoading;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  /** Enable IntersectionObserver-based lazy loading (default: true) */
  enableIntersectionObserver?: boolean;
  /** Intersection root margin - load images this far before entering viewport (default: "50px") */
  rootMargin?: string;
}

export const LazyAvatarImage = memo(
  forwardRef<ElementRef<typeof AvatarPrimitive.Image>, LazyAvatarImageProps>(
    (
      {
        src,
        className,
        loading = ImageLoadings.LAZY,
        referrerPolicy = 'no-referrer',
        enableIntersectionObserver = true,
        rootMargin = '50px',
        ...props
      },
      ref,
    ) => {
      const [shouldLoad, setShouldLoad] = useState(!enableIntersectionObserver);
      const imgRef = useRef<HTMLImageElement | null>(null);

      useEffect(() => {
        if (!enableIntersectionObserver || typeof window === 'undefined') {
          setShouldLoad(true);
          return;
        }

        if (!('IntersectionObserver' in window)) {
          setShouldLoad(true);
          return;
        }

        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                setShouldLoad(true);
                observer.disconnect();
              }
            });
          },
          {
            rootMargin,
            threshold: 0,
          },
        );

        const currentRef = imgRef.current;
        if (currentRef) {
          observer.observe(currentRef);
        }

        return () => {
          if (currentRef) {
            observer.unobserve(currentRef);
          }
          observer.disconnect();
        };
      }, [enableIntersectionObserver, rootMargin]);

      return (
        <AvatarPrimitive.Image
          ref={(node) => {
            imgRef.current = node;
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
          }}
          data-slot="avatar-image"
          className={cn('aspect-square size-full', className)}
          src={shouldLoad ? src : undefined}
          loading={loading}
          referrerPolicy={referrerPolicy}
          {...props}
        />
      );
    },
  ),
);

LazyAvatarImage.displayName = 'LazyAvatarImage';
