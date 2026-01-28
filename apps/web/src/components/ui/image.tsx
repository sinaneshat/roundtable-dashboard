/**
 * Image Component
 *
 * Uses @unpic/react for automatic image optimization.
 * TanStack Start recommended replacement for next/image.
 *
 * Features:
 * - Automatic lazy loading with native browser support
 * - Responsive srcset/sizes generation
 * - LQIP blur placeholder via Unpic's background prop
 * - CDN-aware optimization (Cloudinary, Imgix, Shopify, etc.)
 * - WebP/AVIF format delivery when supported
 * - No build step required - works with any image CDN
 *
 * @see https://unpic.pics/img/react/
 */

import type { ImagePlaceholderType } from '@roundtable/shared/enums';
import { ImagePlaceholderTypes } from '@roundtable/shared/enums';
import type { ImageProps as UnpicImageProps } from '@unpic/react';
import { Image as UnpicImage } from '@unpic/react';
import type { CSSProperties, ImgHTMLAttributes } from 'react';

import { cn } from '@/lib/ui/cn';

type ImageProps = {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  /**
   * Placeholder strategy:
   * - 'blur': Uses blurDataURL or auto-generated LQIP
   * - 'empty': No placeholder
   */
  placeholder?: ImagePlaceholderType;
  /**
   * LQIP data URI, color, gradient, or 'auto' for CDN-generated placeholder.
   * When placeholder='blur', this sets the background.
   * - 'auto': CDN generates low-res placeholder (Cloudinary, Imgix, etc.)
   * - '#hex' or 'rgb()': Solid color placeholder
   * - 'linear-gradient(...)': Gradient placeholder
   * - 'data:image/...': Custom LQIP data URI
   */
  blurDataURL?: string;
  /** Skip @unpic optimization - use native img */
  unoptimized?: boolean;
  style?: CSSProperties;
  className?: string;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height' | 'placeholder'>;

// Default muted gray placeholder for blur effect
const DEFAULT_BLUR_BG = '#27272a';

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
 * // With blur placeholder (auto-generated from CDN)
 * <Image src="https://res.cloudinary.com/demo/image/upload/sample.jpg" alt="Photo" placeholder="blur" blurDataURL="auto" width={400} height={300} />
 *
 * @example
 * // With custom LQIP data URI
 * <Image src="/photo.jpg" alt="Photo" placeholder="blur" blurDataURL="data:image/jpeg;base64,..." width={400} height={300} />
 *
 * @example
 * // With color placeholder
 * <Image src="/photo.jpg" alt="Photo" placeholder="blur" blurDataURL="#3b82f6" width={400} height={300} />
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
  ...props
}: ImageProps) {
  // Convert width/height to numbers for @unpic
  const numWidth = typeof width === 'string' ? Number.parseInt(width, 10) : width;
  const numHeight = typeof height === 'string' ? Number.parseInt(height, 10) : height;

  // Fill mode styles for native img
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

  // Determine background for Unpic (native LQIP support)
  const background = placeholder === ImagePlaceholderTypes.BLUR
    ? (blurDataURL || DEFAULT_BLUR_BG)
    : undefined;

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
        fetchPriority={priority ? 'high' : 'auto'}
        className={className}
        {...props}
      />
    );
  }

  // Create className with fill styles
  const imageClassName = cn(
    className,
    fill && 'absolute top-0 left-0 w-full h-full object-cover',
  );

  // Render different variants based on fill mode to satisfy @unpic discriminated union types
  if (fill) {
    return (
      <div
        className={cn('relative overflow-hidden w-full h-full')}
        style={style}
      >
        <UnpicImage
          src={src}
          alt={alt}
          layout="fullWidth"
          fetchPriority={priority ? 'high' : 'auto'}
          loading={priority ? 'eager' : 'lazy'}
          background={background}
          className={imageClassName}
          {...props}
        />
      </div>
    );
  }

  // Non-fill mode: must provide explicit width/height for @unpic discriminated union
  const unpicProps = {
    src,
    alt,
    width: numWidth,
    height: numHeight,
    fetchPriority: priority ? 'high' : 'auto',
    loading: priority ? 'eager' : 'lazy',
    background,
    className: imageClassName,
  } as UnpicImageProps;

  return (
    <div
      className={cn('relative overflow-hidden')}
      style={style}
    >
      <UnpicImage {...unpicProps} />
    </div>
  );
}

export type { ImageProps };
