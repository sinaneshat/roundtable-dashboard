/**
 * Image Component
 *
 * Native <img> wrapper with fill, priority, and lazy loading support.
 * For production optimization, consider Cloudflare Images.
 */

import type { CSSProperties, ImgHTMLAttributes } from 'react';

type ImageProps = {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  unoptimized?: boolean;
  style?: CSSProperties;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height'>;

/**
 * Image component with lazy loading and fill mode support
 */
export default function Image({
  src,
  alt,
  width,
  height,
  fill,
  priority,
  quality,
  placeholder,
  blurDataURL,
  unoptimized,
  style,
  ...props
}: ImageProps) {
  const imgStyle: CSSProperties = {
    ...style,
    ...(fill && {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    }),
  };

  return (
    <img
      src={src}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      style={imgStyle}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      {...props}
    />
  );
}

export type { ImageProps };
