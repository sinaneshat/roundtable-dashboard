'use client';

import { motion } from 'framer-motion';
import { Copy, ExternalLink, Image as ImageIcon, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { WebSearchResultItem } from '@/api/routes/chat/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/utils';
import { cn } from '@/lib/ui/cn';

type WebSearchImageGalleryProps = {
  results: WebSearchResultItem[];
  className?: string;
};

type ImageItem = {
  url: string;
  title: string;
  source: string;
  sourceUrl: string;
  description?: string;
  alt?: string;
  author?: string;
  publishedDate?: string;
  domain?: string;
};

export function WebSearchImageGallery({ results, className }: WebSearchImageGalleryProps) {
  const tImages = useTranslations('chat.tools.webSearch.images');
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);
  const [loadingImages, setLoadingImages] = useState(() => new Set<string>());
  const [failedImages, setFailedImages] = useState(() => new Set<string>());

  // Collect all images from results (both metadata.imageUrl and images[])
  const allImages: ImageItem[] = results.flatMap((result) => {
    const images: ImageItem[] = [];

    // Add main image from metadata
    if (result.metadata?.imageUrl) {
      images.push({
        url: result.metadata.imageUrl,
        title: result.title,
        source: result.domain || result.url,
        sourceUrl: result.url,
        description: result.metadata.description,
        author: result.metadata.author,
        publishedDate: result.publishedDate || undefined,
        domain: result.domain,
      });
    }

    // Add additional images from images array
    if (result.images && result.images.length > 0) {
      result.images.forEach((img) => {
        images.push({
          url: img.url,
          title: result.title,
          source: result.domain || result.url,
          sourceUrl: result.url,
          description: img.description,
          alt: img.alt,
          domain: result.domain,
        });
      });
    }

    return images;
  });

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: tImages('urlCopied'),
        description: tImages('urlCopiedDescription'),
      });
    } catch {
      toast({
        title: tImages('loadError'),
        variant: 'destructive',
      });
    }
  };

  const handleImageLoad = (url: string) => {
    setLoadingImages((prev) => {
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
  };

  const handleImageError = (url: string) => {
    setLoadingImages((prev) => {
      const next = new Set(prev);
      next.delete(url);
      return next;
    });
    setFailedImages(prev => new Set([...prev, url]));
  };

  if (allImages.length === 0) {
    return null;
  }

  return (
    <>
      <div className={cn('space-y-2', className)}>
        <div className="flex items-center gap-2">
          <ImageIcon className="size-4 text-primary" />
          <span className="text-sm font-medium">{tImages('title')}</span>
          <Badge variant="secondary" className="text-xs">
            {tImages('count', { count: allImages.length })}
          </Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
          {allImages.map((image, idx) => {
            const isLoading = loadingImages.has(image.url);
            const hasFailed = failedImages.has(image.url);

            return (
              <motion.div
                key={image.url}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.03 }}
                className="group relative aspect-square rounded-lg overflow-hidden border border-border/50 bg-muted cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all duration-200"
                onClick={() => !hasFailed && setSelectedImage(image)}
              >
                {/* Loading skeleton */}
                {isLoading && <Skeleton className="absolute inset-0" />}

                {/* Failed state */}
                {hasFailed && (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
                    <div className="text-center space-y-1">
                      <ImageIcon className="size-6 text-muted-foreground mx-auto" />
                      <p className="text-xs text-muted-foreground px-2">{tImages('loadError')}</p>
                    </div>
                  </div>
                )}

                {/* Image */}
                {!hasFailed && (
                  <>
                    {/* eslint-disable-next-line next/no-img-element -- External image from search result */}
                    <img
                      src={image.url}
                      alt={image.alt || image.title}
                      className={cn(
                        'object-cover size-full transition-all duration-300 group-hover:scale-110',
                        isLoading && 'opacity-0',
                      )}
                      loading="lazy"
                      onLoad={() => handleImageLoad(image.url)}
                      onError={() => handleImageError(image.url)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-xs font-medium text-foreground line-clamp-2">
                          {image.title}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {image.domain || image.source}
                        </p>
                      </div>
                    </div>
                    {/* AI Description indicator */}
                    {image.description && (
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Badge variant="secondary" className="text-xs bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30">
                          <Sparkles className="size-2.5 mr-1" />
                          AI
                        </Badge>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Image Preview Dialog - Enhanced with AI descriptions */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="w-[calc(100vw-2.5rem)] sm:w-[calc(100vw-3rem)] max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="line-clamp-2 pr-8">{selectedImage?.title}</DialogTitle>
            <DialogDescription className="flex items-center gap-2 mt-2">
              <a
                href={selectedImage?.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline text-sm"
              >
                {selectedImage?.domain || selectedImage?.source}
                <ExternalLink className="size-3" />
              </a>
            </DialogDescription>
          </DialogHeader>

          <div className={cn(
            'grid gap-6',
            selectedImage?.description ? 'md:grid-cols-[1.5fr,1fr]' : 'grid-cols-1',
          )}
          >
            {/* Image */}
            {selectedImage?.url && (
              <div className="relative w-full max-h-[65vh] rounded-lg overflow-hidden bg-muted/30 border border-border flex items-center justify-center">
                {/* eslint-disable-next-line next/no-img-element -- External image from search result */}
                <img
                  src={selectedImage.url}
                  alt={selectedImage.alt || selectedImage.description || selectedImage.title}
                  className="object-contain w-full h-full max-h-[65vh]"
                />
              </div>
            )}

            {/* Details Sidebar */}
            {selectedImage && (
              <div className="space-y-4 overflow-y-auto max-h-[65vh]">
                {/* AI Description */}
                {selectedImage.description && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center size-7 rounded-full bg-purple-500/10">
                        <Sparkles className="size-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <h3 className="font-semibold text-sm">{tImages('aiAnalysis')}</h3>
                      <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20">
                        {tImages('visionApi')}
                      </Badge>
                    </div>

                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {selectedImage.description}
                    </p>
                  </div>
                )}

                {/* Metadata */}
                {(selectedImage.author || selectedImage.publishedDate) && (
                  <div className="space-y-2 pt-3 border-t border-border">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Source Information
                    </h4>
                    {selectedImage.author && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">
                          {tImages('author')}
                          :
                        </span>
                        <span className="font-medium">{selectedImage.author}</span>
                      </div>
                    )}
                    {selectedImage.publishedDate && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">
                          {tImages('published')}
                          :
                        </span>
                        <span className="font-medium">
                          {new Date(selectedImage.publishedDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {selectedImage.domain && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Domain:</span>
                        <span className="font-medium">{selectedImage.domain}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-2 pt-3 border-t border-border">
                  <Button asChild variant="default" size="sm" className="w-full">
                    <a
                      href={selectedImage.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2"
                    >
                      <ExternalLink className="size-4" />
                      {tImages('viewSource')}
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleCopyUrl(selectedImage.url)}
                  >
                    <Copy className="size-4" />
                    {tImages('copyUrl')}
                  </Button>
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <a
                      href={selectedImage.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2"
                    >
                      <ImageIcon className="size-4" />
                      {tImages('viewFull')}
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
