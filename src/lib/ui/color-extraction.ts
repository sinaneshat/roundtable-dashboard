/**
 * Color Extraction Utilities
 *
 * Dynamically extracts dominant colors from images for theming
 */

import chroma from 'chroma-js';

/**
 * Cache for extracted colors to avoid re-processing
 */
const colorCache = new Map<string, string>();

/**
 * Extract dominant color from an image and return closest Tailwind color class
 *
 * @param imageSrc - Image source URL
 * @param isUser - Whether this is a user avatar (always returns white for text)
 * @returns Tailwind color class (e.g., 'orange-500', 'blue-500')
 */
export async function extractColorFromImage(
  imageSrc: string,
  isUser: boolean = false,
): Promise<string> {
  // User always gets white text
  if (isUser) {
    return 'white';
  }

  // Check cache first
  if (colorCache.has(imageSrc)) {
    return colorCache.get(imageSrc)!;
  }

  try {
    // Create an image element
    const img = new Image();

    // Only set crossOrigin for external URLs
    if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }

    // Wait for image to load
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageSrc;
    });

    // Create canvas and get pixel data
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Set canvas size to image size
    canvas.width = img.width;
    canvas.height = img.height;

    // Draw image on canvas
    ctx.drawImage(img, 0, 0);

    // Get pixel data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    // Extract dominant color using color quantization
    const colorFrequency = new Map<string, number>();

    // Sample pixels (skip some for performance)
    const sampleRate = 10;
    for (let i = 0; i < pixels.length; i += 4 * sampleRate) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];

      // Skip invalid or transparent or near-white/black pixels
      if (r === undefined || g === undefined || b === undefined || a === undefined || a < 128 || (r > 240 && g > 240 && b > 240) || (r < 15 && g < 15 && b < 15)) {
        continue;
      }

      // Create color key (rounded to reduce variations)
      const colorKey = `${Math.round(r / 10) * 10},${Math.round(g / 10) * 10},${Math.round(b / 10) * 10}`;
      colorFrequency.set(colorKey, (colorFrequency.get(colorKey) || 0) + 1);
    }

    // Find most frequent color
    let dominantColor = '';
    let maxFrequency = 0;

    for (const [color, frequency] of colorFrequency.entries()) {
      if (frequency > maxFrequency) {
        maxFrequency = frequency;
        dominantColor = color;
      }
    }

    if (!dominantColor) {
      // Fallback to muted-foreground if no color found
      return 'muted-foreground';
    }

    // Convert to chroma color
    const rgbValues = dominantColor.split(',').map(Number);
    const r = rgbValues[0];
    const g = rgbValues[1];
    const b = rgbValues[2];

    if (r === undefined || g === undefined || b === undefined) {
      return 'muted-foreground';
    }

    const chromaColor = chroma.rgb(r, g, b);

    // Map to closest Tailwind color
    const tailwindColor = mapToTailwindColor(chromaColor);

    // Cache the result
    colorCache.set(imageSrc, tailwindColor);

    return tailwindColor;
  } catch {
    // Fallback to muted-foreground on error
    return 'muted-foreground';
  }
}

/**
 * Map a chroma color to the closest Tailwind color class
 *
 * @param color - Chroma color object
 * @returns Tailwind color class
 */
function mapToTailwindColor(color: chroma.Color): string {
  const hsl = color.hsl();
  const [h, s, l] = hsl;

  // Handle undefined hue (grayscale colors)
  if (h === undefined || Number.isNaN(h) || s < 0.1) {
    // Grayscale
    if (l > 0.7)
      return 'slate-400';
    if (l > 0.4)
      return 'slate-500';
    return 'slate-600';
  }

  // Determine color family based on hue
  // Hue wheel: 0=red, 30=orange, 60=yellow, 120=green, 180=cyan, 240=blue, 300=magenta

  if (h >= 0 && h < 15) {
    // Red
    return s > 0.5 && l < 0.6 ? 'red-500' : 'red-400';
  } else if (h >= 15 && h < 45) {
    // Orange
    return s > 0.5 && l < 0.6 ? 'orange-500' : 'orange-400';
  } else if (h >= 45 && h < 70) {
    // Yellow/Amber
    return s > 0.5 ? 'amber-500' : 'yellow-500';
  } else if (h >= 70 && h < 150) {
    // Green
    if (h < 100) {
      return s > 0.5 && l < 0.6 ? 'lime-500' : 'lime-400';
    }
    return s > 0.5 && l < 0.5 ? 'emerald-500' : 'green-500';
  } else if (h >= 150 && h < 200) {
    // Cyan/Teal
    return s > 0.5 && l < 0.6 ? 'cyan-500' : 'teal-500';
  } else if (h >= 200 && h < 260) {
    // Blue
    if (h < 220) {
      return s > 0.5 && l < 0.6 ? 'sky-500' : 'blue-400';
    }
    return s > 0.5 && l < 0.5 ? 'blue-600' : 'blue-500';
  } else if (h >= 260 && h < 300) {
    // Purple/Violet
    return s > 0.5 && l < 0.6 ? 'purple-500' : 'violet-500';
  } else if (h >= 300 && h < 330) {
    // Magenta/Fuchsia
    return s > 0.5 ? 'fuchsia-500' : 'pink-500';
  } else {
    // Pink/Red
    return s > 0.5 && l < 0.6 ? 'pink-500' : 'rose-500';
  }
}

/**
 * Clear the color cache (useful for testing or when images change)
 */
export function clearColorCache(): void {
  colorCache.clear();
}

/**
 * Preload and extract color from an image
 * Useful for preloading colors before they're needed
 *
 * @param imageSrc - Image source URL
 */
export function preloadImageColor(imageSrc: string): void {
  extractColorFromImage(imageSrc, false).catch(() => {
    // Silently fail preload attempts
  });
}
