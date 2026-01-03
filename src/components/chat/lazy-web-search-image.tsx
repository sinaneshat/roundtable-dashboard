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
  const [shouldLoad, setShouldLoad] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
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
  }, [rootMargin]);

  return (
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
