/**
 * Image Component
 *
 * Uses @unpic/react for automatic image optimization.
 * TanStack Start recommended replacement for next/image.
 *
 * Features:
 * - Automatic lazy loading
 * - Responsive sizing
 * - Blur placeholder support
 * - CDN-aware optimization
 */

import type { ImagePlaceholderType } from '@roundtable/shared/enums';
import { ImagePlaceholderTypes } from '@roundtable/shared/enums';
import type { ImageProps as UnpicImageProps } from '@unpic/react';
import { Image as UnpicImage } from '@unpic/react';
import type { CSSProperties, ImgHTMLAttributes } from 'react';
import { useState } from 'react';

import { cn } from '@/lib/ui/cn';

type ImageProps = {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  placeholder?: ImagePlaceholderType;
  blurDataURL?: string;
  /** Skip @unpic optimization - use native img */
  unoptimized?: boolean;
  style?: CSSProperties;
  className?: string;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height' | 'placeholder'>;

// Tiny 1x1 transparent placeholder for blur effect
const BLUR_PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * Optimized image component with @unpic/react
 *
 * @example
 * // Basic usage
 * <Image src="/photo.jpg" alt="Photo" width={400} height={300} />
 *
 * @example
 * // Fill container
 * <Image src="/bg.jpg" alt="Background" fill />
 *
 * @example
 * // With blur placeholder
 * <Image src="/photo.jpg" alt="Photo" placeholder="blur" width={400} height={300} />
 */
export default function Image({
  src,
  alt,
  width,
  height,
  fill,
  priority,
  placeholder,
  blurDataURL,
  unoptimized,
  style,
  className,
  onLoad,
  ...props
}: ImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  // Convert width/height to numbers for @unpic
  const numWidth = typeof width === 'string' ? parseInt(width, 10) : width;
  const numHeight = typeof height === 'string' ? parseInt(height, 10) : height;

  // Fill mode styles
  const fillStyle: CSSProperties = fill
    ? {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
      }
    : {};

  // Blur placeholder background
  const blurStyle: CSSProperties = placeholder === ImagePlaceholderTypes.BLUR && !isLoaded
    ? {
        backgroundImage: `url(${blurDataURL || BLUR_PLACEHOLDER})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'blur(20px)',
        transform: 'scale(1.1)',
      }
    : {};

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setIsLoaded(true);
    onLoad?.(e);
  };

  // Use native img for unoptimized or data URIs
  if (unoptimized || src.startsWith('data:')) {
    return (
      <img
        src={src}
        alt={alt}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        style={{ ...style, ...fillStyle }}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className={className}
        onLoad={handleLoad}
        {...props}
      />
    );
  }

  // Combined wrapper styles for blur effect and custom styles
  const wrapperStyle: CSSProperties = {
    ...(placeholder === ImagePlaceholderTypes.BLUR ? blurStyle : {}),
    ...style,
  };

  // Create className with fill styles since @unpic/react doesn't accept style prop
  const imageClassName = cn(
    className,
    fill && 'absolute top-0 left-0 w-full h-full object-cover',
    placeholder === ImagePlaceholderTypes.BLUR && 'transition-opacity duration-300 ease-in-out',
    placeholder === ImagePlaceholderTypes.BLUR && !isLoaded && 'opacity-0',
  );

  // Render different variants based on fill mode to satisfy @unpic discriminated union types
  if (fill) {
    return (
      <div
        className={cn('relative overflow-hidden w-full h-full')}
        style={Object.keys(wrapperStyle).length > 0 ? wrapperStyle : undefined}
      >
        <UnpicImage
          src={src}
          alt={alt}
          layout="fullWidth"
          fetchPriority={priority ? 'high' : undefined}
          className={imageClassName}
          onLoad={handleLoad}
          {...props}
        />
      </div>
    );
  }

  // Non-fill mode: must provide explicit width/height for @unpic discriminated union
  // Type cast: Our ImageProps extends ImgHTMLAttributes, but @unpic accepts a subset
  const unpicProps = {
    src,
    alt,
    width: numWidth,
    height: numHeight,
    fetchPriority: priority ? 'high' : undefined,
    className: imageClassName,
    onLoad: handleLoad,
  } as UnpicImageProps;

  return (
    <div
      className={cn('relative overflow-hidden')}
      style={Object.keys(wrapperStyle).length > 0 ? wrapperStyle : undefined}
    >
      <UnpicImage {...unpicProps} />
    </div>
  );
}

export type { ImageProps };
