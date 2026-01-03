'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Lazy-loaded Web Search Image
 *
 * Optimized for search result galleries:
 * - Uses IntersectionObserver to load only when near viewport
 * - Prevents unnecessary network requests for off-screen images
 * - Maintains aspect ratio and prevents layout shift
 * - Handles load errors gracefully
 *
 * Performance Impact:
 * - Reduces initial network load for image-heavy search results
 * - Only loads images as user scrolls
 * - Falls back to native lazy loading if IntersectionObserver unavailable
 *
 * Note: Uses native <img> intentionally for external web search results
 * where Next.js Image optimization is not applicable (unknown external domains).
 */

type LazyWebSearchImageProps = {
  src: string;
  alt: string;
  className?: string;
  onError: () => void;
  /** IntersectionObserver root margin (default: "100px") */
  rootMargin?: string;
};

export function LazyWebSearchImage({
  src,
  alt,
  className,
  onError,
  rootMargin = '100px',
}: LazyWebSearchImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [shouldLoad, setShouldLoad] = useState(() => {
    // SSR fallback - load immediately if no IntersectionObserver
    if (typeof window === 'undefined')
      return true;
    if (!('IntersectionObserver' in window))
      return true;
    return false;
  });

  useEffect(() => {
    // Skip if already loading or no IntersectionObserver support
    if (shouldLoad)
      return;
    if (typeof window === 'undefined' || !('IntersectionObserver' in window))
      return;

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
  }, [rootMargin, shouldLoad]);

  return (
    // eslint-disable-next-line next/no-img-element -- External web search images from unknown domains
    <img
      ref={imgRef}
      src={shouldLoad ? src : undefined}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}
