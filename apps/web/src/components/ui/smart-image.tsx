import type { ImageState } from '@roundtable/shared';
import { DEFAULT_IMAGE_STATE, ImageStates } from '@roundtable/shared';
import type { ImgHTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';

import { cn } from '@/lib/ui/cn';

import type { ImageProps } from './image';
import Image from './image';

import { Skeleton } from './skeleton';

/**
 * BlurThumbnail - Lightweight image component for external URLs
 *
 * Uses native <img> with skeleton loading for external/arbitrary URLs
 * where CDN optimization isn't available. Perfect for:
 * - Web search result thumbnails
 * - External favicons
 * - User-provided images from unknown sources
 */
type BlurThumbnailProps = {
  src: string;
  alt: string;
  containerClassName?: string;
  onLoadSuccess?: () => void;
  onLoadError?: () => void;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'onLoad' | 'onError'>;

export function BlurThumbnail({
  src,
  alt,
  className,
  containerClassName,
  onLoadSuccess,
  onLoadError,
  ...props
}: BlurThumbnailProps) {
  const [imageState, setImageState] = useState<ImageState>(DEFAULT_IMAGE_STATE);

  const handleLoad = () => {
    setImageState(ImageStates.LOADED);
    onLoadSuccess?.();
  };

  const handleError = () => {
    setImageState(ImageStates.ERROR);
    onLoadError?.();
  };

  if (imageState === ImageStates.ERROR) {
    return null;
  }

  return (
    <div className={cn('relative overflow-hidden', containerClassName)}>
      {imageState === ImageStates.LOADING && (
        <Skeleton className="absolute inset-0 rounded-none" />
      )}
      <img
        src={src}
        alt={alt}
        className={cn(
          'w-full h-full object-cover transition-opacity duration-300',
          imageState === ImageStates.LOADING && 'opacity-0',
          imageState === ImageStates.LOADED && 'opacity-100',
          className,
        )}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={handleLoad}
        onError={handleError}
        {...props}
      />
    </div>
  );
}

type SmartImageProps = {
  /** Custom fallback content when image fails to load */
  fallback?: ReactNode;
  /** Fallback text shown in default error state */
  fallbackText?: string;
  /** CSS aspect ratio (e.g., "16/9", "1/1", "4/3") - auto-sizes container */
  aspectRatio?: string;
  /** Additional class for the wrapper container */
  containerClassName?: string;
  /** Callback when image loads successfully */
  onLoadSuccess?: () => void;
  /** Callback when image fails to load */
  onLoadError?: () => void;
  /** Show skeleton with shimmer animation */
  showSkeleton?: boolean;
} & Omit<ImageProps, 'onLoad' | 'onError'>;

export function SmartImage({
  src,
  alt,
  fallback,
  fallbackText,
  aspectRatio,
  containerClassName,
  className,
  onLoadSuccess,
  onLoadError,
  showSkeleton = true,
  fill,
  width,
  height,
  ...imageProps
}: SmartImageProps) {
  const [imageState, setImageState] = useState<ImageState>(DEFAULT_IMAGE_STATE);

  const handleLoad = () => {
    setImageState(ImageStates.LOADED);
    onLoadSuccess?.();
  };

  const handleError = () => {
    setImageState(ImageStates.ERROR);
    onLoadError?.();
  };

  const useFill = fill || (!width && !height && !!aspectRatio);

  const containerStyles = aspectRatio ? { aspectRatio } : undefined;

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        useFill && 'w-full',
        containerClassName,
      )}
      style={containerStyles}
    >
      {showSkeleton && imageState === ImageStates.LOADING && (
        <Skeleton className={cn('absolute inset-0 rounded-none', aspectRatio && 'w-full h-full')} />
      )}

      {imageState === ImageStates.ERROR && (
        fallback || (
          fallbackText && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 text-muted-foreground text-sm">
              {fallbackText}
            </div>
          )
        )
      )}

      {imageState !== ImageStates.ERROR && (
        <Image
          src={src}
          alt={alt}
          fill={useFill}
          width={!useFill ? width : undefined}
          height={!useFill ? height : undefined}
          className={cn(
            'object-cover transition-opacity duration-300',
            imageState === ImageStates.LOADING && 'opacity-0',
            imageState === ImageStates.LOADED && 'opacity-100',
            className,
          )}
          onLoad={handleLoad}
          onError={handleError}
          {...imageProps}
        />
      )}
    </div>
  );
}

import type { BorderRadiusClass } from '@/lib/enums/ui-styles';
import { BORDER_RADIUS_PIXEL_MAP, DEFAULT_BORDER_RADIUS_CLASS } from '@/lib/enums/ui-styles';

type GradientImageProps = {
  gradient?: string;
  borderWidth?: number;
  rounded?: BorderRadiusClass;
} & SmartImageProps;

export function GradientImage({
  gradient = 'from-[#00ccb1] via-[#7b61ff] to-[#ffc414]',
  borderWidth = 3,
  rounded = DEFAULT_BORDER_RADIUS_CLASS,
  containerClassName,
  className,
  ...imageProps
}: GradientImageProps) {
  const outerRadius = BORDER_RADIUS_PIXEL_MAP[rounded];
  const innerRadius = Math.max(0, outerRadius - borderWidth);
  const innerRounded = `rounded-[${innerRadius}px]`;

  return (
    <div
      className={cn('relative bg-linear-to-br', gradient, rounded, containerClassName)}
      style={{ padding: `${borderWidth}px` }}
    >
      <SmartImage
        containerClassName={cn(innerRounded, 'bg-zinc-900')}
        className={cn(innerRounded, className)}
        {...imageProps}
      />
    </div>
  );
}
