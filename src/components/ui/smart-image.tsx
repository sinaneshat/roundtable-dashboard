'use client';

/**
 * SmartImage Component - Reusable Next.js Image with Built-in Loading States
 *
 * Features:
 * - Skeleton loading state while image loads
 * - Blur placeholder support for static imports
 * - Error fallback with customizable content
 * - Automatic aspect ratio preservation
 * - Works with both local and remote images
 *
 * Usage:
 * ```tsx
 * // Basic usage
 * <SmartImage src="/image.png" alt="Description" width={400} height={300} />
 *
 * // With custom fallback
 * <SmartImage
 *   src={dynamicUrl}
 *   alt="Preview"
 *   fill
 *   fallback={<CustomFallback />}
 * />
 *
 * // With aspect ratio (no width/height needed)
 * <SmartImage src="/image.png" alt="Description" aspectRatio="16/9" />
 * ```
 */

import type { ImageProps } from 'next/image';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { cn } from '@/lib/ui/cn';

import { Skeleton } from './skeleton';

type ImageState = 'loading' | 'loaded' | 'error';

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
  const [imageState, setImageState] = useState<ImageState>('loading');

  const handleLoad = () => {
    setImageState('loaded');
    onLoadSuccess?.();
  };

  const handleError = () => {
    setImageState('error');
    onLoadError?.();
  };

  // Determine if we should use fill mode or explicit dimensions
  const useFill = fill || (!width && !height && !!aspectRatio);

  // Container styles based on mode
  const containerStyles = aspectRatio
    ? { aspectRatio }
    : undefined;

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        useFill && 'w-full',
        containerClassName
      )}
      style={containerStyles}
    >
      {/* Skeleton loading state */}
      {showSkeleton && imageState === 'loading' && (
        <Skeleton
          className={cn(
            'absolute inset-0 rounded-none',
            aspectRatio && 'w-full h-full'
          )}
        />
      )}

      {/* Error fallback */}
      {imageState === 'error' && (
        fallback || (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50 text-muted-foreground text-sm">
            {fallbackText}
          </div>
        )
      )}

      {/* Next.js Image */}
      <Image
        src={src}
        alt={alt}
        fill={useFill}
        width={!useFill ? width : undefined}
        height={!useFill ? height : undefined}
        className={cn(
          'object-cover transition-opacity duration-300',
          imageState === 'loading' && 'opacity-0',
          imageState === 'loaded' && 'opacity-100',
          imageState === 'error' && 'hidden',
          className
        )}
        onLoad={handleLoad}
        onError={handleError}
        {...imageProps}
      />
    </div>
  );
}

/**
 * SmartImage with gradient border wrapper
 * Commonly used for preview cards and featured images
 */
type GradientImageProps = SmartImageProps & {
  /** Gradient colors - defaults to brand gradient */
  gradient?: string;
  /** Border thickness in pixels */
  borderWidth?: number;
  /** Border radius class */
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
  // Calculate inner radius: outer radius minus border width
  // rounded-xl = 12px, rounded-2xl = 16px, rounded-lg = 8px
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
      className={cn(
        'relative bg-linear-to-br',
        gradient,
        rounded,
        containerClassName
      )}
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
