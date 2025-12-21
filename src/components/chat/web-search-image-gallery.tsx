'use client';

import { ExternalLink, Image as ImageIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { WebSearchImageGalleryProps, WebSearchImageItem } from '@/api/routes/chat/schema';
import { cn } from '@/lib/ui/cn';
import { safeExtractDomain } from '@/lib/utils/web-search-utils';

export function WebSearchImageGallery({ results, className }: WebSearchImageGalleryProps) {
  const tImages = useTranslations('chat.tools.webSearch.images');
  const [failedImages, setFailedImages] = useState(() => new Set<string>());

  // Collect all images from results (both metadata.imageUrl and images[])
  const allImages: WebSearchImageItem[] = results.flatMap((result) => {
    const images: WebSearchImageItem[] = [];
    const domain = result.domain || safeExtractDomain(result.url);

    // Add main image from metadata
    if (result.metadata?.imageUrl) {
      images.push({
        url: result.metadata.imageUrl,
        title: result.title,
        sourceUrl: result.url,
        domain,
      });
    }

    // Add additional images from images array
    if (result.images && result.images.length > 0) {
      result.images.forEach((img) => {
        images.push({
          url: img.url,
          title: result.title,
          sourceUrl: result.url,
          alt: img.alt,
          domain,
        });
      });
    }

    return images;
  });

  const handleImageError = (url: string) => {
    setFailedImages(prev => new Set([...prev, url]));
  };

  // Deduplicate by URL and filter out failed images
  const visibleImages = allImages
    .filter((img, idx, arr) => arr.findIndex(i => i.url === img.url) === idx)
    .filter(img => !failedImages.has(img.url));

  if (visibleImages.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <ImageIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {tImages('count', { count: visibleImages.length })}
        </span>
      </div>

      {/* Image Grid - Compact thumbnails that link to source */}
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
              {/* Image */}
              {/* eslint-disable-next-line next/no-img-element -- External image from search result */}
              <img
                src={image.url}
                alt={image.alt || image.title}
                className="object-cover size-full group-hover:scale-105 transition-transform duration-200"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => handleImageError(image.url)}
              />

              {/* Hover overlay with external link indicator */}
              <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <ExternalLink className="size-3.5 text-primary" />
              </div>
            </motion.a>
          );
        })}

        {/* Show +N more indicator */}
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
