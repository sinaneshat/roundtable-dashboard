import { motion } from 'motion/react';
import { useMemo, useState } from 'react';

import { Icons } from '@/components/icons';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import { safeExtractDomain } from '@/lib/utils';
import type { WebSearchResultItem } from '@/services/api';

export type WebSearchImageItem = {
  url: string;
  alt?: string;
  title: string;
  sourceUrl: string;
  domain?: string;
  thumbnailUrl?: string;
};

export type WebSearchImageGalleryProps = {
  results: WebSearchResultItem[];
  className?: string;
};

export function WebSearchImageGallery({ className, results }: WebSearchImageGalleryProps) {
  const tImages = useTranslations('chat.tools.webSearch.images');
  const [failedImages, setFailedImages] = useState(() => new Set<string>());
  const [loadedImages, setLoadedImages] = useState(() => new Set<string>());

  const handleImageLoad = (url: string) => {
    setLoadedImages((prev) => {
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  };

  const allImages: WebSearchImageItem[] = results.flatMap((result) => {
    const images: WebSearchImageItem[] = [];
    const domain = result.domain || safeExtractDomain(result.url);

    if (result.metadata?.imageUrl) {
      images.push({
        domain,
        sourceUrl: result.url,
        title: result.title,
        url: result.metadata.imageUrl,
      });
    }

    if (result.images && result.images.length > 0) {
      result.images.forEach((img: { url: string; description?: string; alt?: string }) => {
        images.push({
          alt: img.alt,
          domain,
          sourceUrl: result.url,
          title: result.title,
          url: img.url,
        });
      });
    }

    return images;
  });

  const handleImageError = (url: string) => {
    setFailedImages((prev) => {
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  };

  // ✅ PERF FIX: Use Set for O(n) deduplication instead of O(n²) findIndex
  // ✅ SECURITY FIX: Filter out blob: URLs which browsers block with security errors
  const visibleImages = useMemo(() => {
    const seenUrls = new Set<string>();
    return allImages.filter((img) => {
      // Skip blob: URLs - browsers block cross-origin blob URLs with security errors
      if (img.url.startsWith('blob:')) {
        return false;
      }
      if (seenUrls.has(img.url) || failedImages.has(img.url)) {
        return false;
      }
      seenUrls.add(img.url);
      return true;
    });
  }, [allImages, failedImages]);

  if (visibleImages.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2">
        <Icons.image className="size-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {tImages('count', { count: visibleImages.length })}
        </span>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {visibleImages.slice(0, 8).map((image, idx) => {
          const cleanDomain = image.domain?.replace('www.', '') || '';

          return (
            <motion.a
              key={image.url}
              href={image.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.03 }}
              className="group relative w-16 h-12 rounded-md overflow-hidden border border-border/30 bg-muted/20 hover:border-primary/40 hover:shadow-md transition-all duration-200"
              title={`${image.title} - ${cleanDomain}`}
            >
              {!loadedImages.has(image.url) && (
                <Skeleton className="absolute inset-0 rounded-none" />
              )}
              <img
                src={image.url}
                alt={image.alt || image.title}
                className={cn(
                  'object-cover size-full group-hover:scale-105 transition-all duration-300',
                  !loadedImages.has(image.url) && 'opacity-0',
                  loadedImages.has(image.url) && 'opacity-100',
                )}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onLoad={() => handleImageLoad(image.url)}
                onError={() => handleImageError(image.url)}
              />

              <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Icons.externalLink className="size-3.5 text-primary" />
              </div>
            </motion.a>
          );
        })}

        {visibleImages.length > 8 && (
          <div className="w-16 h-12 rounded-md bg-muted/20 border border-border/30 flex items-center justify-center">
            <span className="text-xs text-muted-foreground">
              +
              {visibleImages.length - 8}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
