/**
 * Cloudflare Image Resizing Utilities
 *
 * Transforms image URLs to use Cloudflare's edge-based image optimization.
 * Works with any image served through your Cloudflare zone.
 *
 * Features:
 * - On-the-fly resizing and format conversion (WebP/AVIF)
 * - Quality optimization
 * - Blur effect support
 * - Zero origin load for cached transformations
 *
 * @see https://developers.cloudflare.com/images/transform-images/transform-via-url/
 */

type CloudflareFit = 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
type CloudflareFormat = 'auto' | 'avif' | 'webp' | 'jpeg' | 'json';
type CloudflareGravity = 'auto' | 'face' | 'left' | 'right' | 'top' | 'bottom' | 'center';

type CloudflareImageOptions = {
  width?: number;
  height?: number;
  fit?: CloudflareFit;
  quality?: number;
  format?: CloudflareFormat;
  blur?: number;
  gravity?: CloudflareGravity;
  dpr?: number;
  sharpen?: number;
  brightness?: number;
  contrast?: number;
};

/**
 * Build Cloudflare Image Resizing URL options string
 */
function buildOptionsString(options: CloudflareImageOptions): string {
  const optionEntries: [string, unknown][] = [
    ['width', options.width],
    ['height', options.height],
    ['fit', options.fit],
    ['quality', options.quality],
    ['format', options.format],
    ['blur', options.blur],
    ['gravity', options.gravity],
    ['dpr', options.dpr],
    ['sharpen', options.sharpen],
    ['brightness', options.brightness],
    ['contrast', options.contrast],
  ];

  return optionEntries
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');
}

/**
 * Check if a URL can be transformed via Cloudflare Image Resizing
 *
 * Only works for:
 * - Same-origin images (relative URLs)
 * - Images on the same Cloudflare zone
 * - External images when Image Resizing is configured for remote images
 */
function isTransformableUrl(src: string, currentOrigin?: string): boolean {
  // Relative URLs are always transformable
  if (src.startsWith('/') && !src.startsWith('//')) {
    return true;
  }

  // Data URIs and blob URLs are not transformable
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    return false;
  }

  // Check if same origin
  if (currentOrigin) {
    try {
      const url = new URL(src);
      const origin = new URL(currentOrigin);
      return url.hostname === origin.hostname;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Transform an image URL to use Cloudflare Image Resizing
 *
 * @example
 * // Basic resizing
 * transformCloudflareImage('/uploads/photo.jpg', { width: 800, height: 600 })
 * // => '/cdn-cgi/image/width=800,height=600/uploads/photo.jpg'
 *
 * @example
 * // With quality and format
 * transformCloudflareImage('/uploads/photo.jpg', { width: 400, quality: 80, format: 'auto' })
 * // => '/cdn-cgi/image/width=400,quality=80,format=auto/uploads/photo.jpg'
 *
 * @example
 * // Generate blur placeholder
 * transformCloudflareImage('/uploads/photo.jpg', { width: 20, blur: 50, quality: 30 })
 * // => '/cdn-cgi/image/width=20,blur=50,quality=30/uploads/photo.jpg'
 */
export function transformCloudflareImage(
  src: string,
  options: CloudflareImageOptions,
): string {
  const optionsString = buildOptionsString(options);
  if (!optionsString)
    return src;

  // Handle relative URLs
  if (src.startsWith('/') && !src.startsWith('//')) {
    return `/cdn-cgi/image/${optionsString}${src}`;
  }

  // Handle absolute URLs - extract path
  try {
    const url = new URL(src);
    return `/cdn-cgi/image/${optionsString}${url.pathname}`;
  } catch {
    return src;
  }
}

/**
 * Generate a low-quality blur placeholder URL for Cloudflare-served images
 *
 * @example
 * generateBlurPlaceholder('/uploads/photo.jpg')
 * // => '/cdn-cgi/image/width=20,blur=50,quality=30,format=auto/uploads/photo.jpg'
 */
export function generateBlurPlaceholder(src: string): string {
  return transformCloudflareImage(src, {
    width: 20,
    blur: 50,
    quality: 30,
    format: 'auto',
  });
}

/**
 * Check if running on Cloudflare (Pages/Workers) where Image Resizing is available
 *
 * ✅ TYPE-SAFE: Uses in-operator for globalThis property access
 */
export function isCloudflareEnvironment(): boolean {
  // Check for Cloudflare-specific globals
  if (typeof globalThis !== 'undefined' && 'caches' in globalThis) {
    // After in-operator check, TypeScript knows caches exists
    // Use indexed access which is valid after in-operator narrowing
    const caches = (globalThis as { caches?: unknown }).caches;
    return typeof caches === 'object' && caches !== null;
  }
  return false;
}

export {
  type CloudflareFit,
  type CloudflareFormat,
  type CloudflareGravity,
  type CloudflareImageOptions,
  isTransformableUrl,
};
