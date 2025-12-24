'use client';

import type { ImageProps } from 'next/image';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { useState } from 'react';

import type { ImageState } from '@/api/core/enums';
import { DEFAULT_IMAGE_STATE, ImageStates } from '@/api/core/enums';
import { cn } from '@/lib/ui/cn';

import { Skeleton } from './skeleton';

type SmartImageProps = Omit<ImageProps, 'onLoad' | 'onError'> & {
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
};

export function SmartImage({
  src,
  alt,
  fallback,
  fallbackText = 'Image unavailable',
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
        containerClassName
      )}
      style={containerStyles}
    >
      {showSkeleton && imageState === ImageStates.LOADING && (
        <Skeleton className={cn('absolute inset-0 rounded-none', aspectRatio && 'w-full h-full')} />
      )}

      {imageState === ImageStates.ERROR && (
        fallback || (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50 text-muted-foreground text-sm">
            {fallbackText}
          </div>
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
            className
          )}
          onLoad={handleLoad}
          onError={handleError}
          {...imageProps}
        />
      )}
    </div>
  );
}

type GradientImageProps = SmartImageProps & {
  gradient?: string;
  borderWidth?: number;
  rounded?: string;
};

export function GradientImage({
  gradient = 'from-[#00ccb1] via-[#7b61ff] to-[#ffc414]',
  borderWidth = 3,
  rounded = 'rounded-xl',
  containerClassName,
  className,
  ...imageProps
}: GradientImageProps) {
  const radiusMap: Record<string, number> = {
    'rounded-xl': 12,
    'rounded-2xl': 16,
    'rounded-lg': 8,
    'rounded-md': 6,
  };
  const outerRadius = radiusMap[rounded] || 12;
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
