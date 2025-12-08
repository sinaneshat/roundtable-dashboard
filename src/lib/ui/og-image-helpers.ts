/**
 * Open Graph Image Generation Helpers
 * Utilities for creating beautiful, branded OG images with Next.js ImageResponse
 *
 * Features:
 * - Base64 encoding for assets (logo, model icons)
 * - Works in all environments (local, preview, production)
 * - HTTP-based asset fetching (compatible with Cloudflare Workers/Pages)
 * - Design system color extraction
 * - Glass-morphism styling helpers
 * - Model icon path resolution
 */

import { BRAND } from '@/constants/brand';
import { getModelIconInfo } from '@/lib/utils/ai-display';

/**
 * Get the base URL for the application
 * Works in all environments: local, preview, and production
 */
function getBaseUrl(): string {
  // In browser/client-side
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  // Server-side: use environment variable
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Fallback for local development
  return 'http://localhost:3000';
}

/**
 * Fetch and base64 encode an image from a URL
 * ImageResponse supports base64 data URLs for <img> tags
 *
 * This uses HTTP fetch instead of file system access, making it compatible
 * with all deployment environments including Cloudflare Workers/Pages
 *
 * @param relativePath - Path relative to public folder (e.g., 'static/logo.png')
 * @returns Base64 data URL string
 */
export async function getBase64Image(relativePath: string): Promise<string> {
  // Remove 'public/' prefix if present, as URLs don't include it
  const cleanPath = relativePath.replace(/^public\//, '');

  // Construct the full URL to the asset
  const baseUrl = getBaseUrl();
  const imageUrl = `${baseUrl}/${cleanPath}`;

  // Fetch the image
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  // Convert to base64 using browser-compatible method
  // NOTE: Using chunk-based conversion to avoid stack overflow with large images
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binary);

  // Determine MIME type from file extension
  const ext = cleanPath.split('.').pop()?.toLowerCase();
  const mimeType = ext === 'png'
    ? 'image/png'
    : ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : ext === 'svg'
        ? 'image/svg+xml'
        : 'image/png';

  return `data:${mimeType};base64,${base64}`;
}

/**
 * Get model icon path from model ID
 * Uses comprehensive provider icon mapping from provider-icons.ts
 *
 * Model ID format: "provider/model-name"
 * Icon path: Resolved from getModelIconInfo utility
 *
 * @param modelId - OpenRouter model ID (e.g., "anthropic/claude-3.5-sonnet")
 * @returns Base64 data URL for the model icon
 */
export async function getModelIconBase64(modelId: string): Promise<string> {
  try {
    // Use comprehensive provider icon utilities
    const { icon } = getModelIconInfo(modelId);

    // Convert public path to fetch path (remove leading slash)
    const iconPath = icon.startsWith('/') ? `public${icon}` : `public/${icon}`;

    return await getBase64Image(iconPath);
  } catch {
    // Fallback: try to load OpenRouter default icon
    try {
      return await getBase64Image('public/static/icons/ai-models/openrouter.png');
    } catch {
      return '';
    }
  }
}

/**
 * Get Roundtable logo as base64 data URL
 * @returns Base64 data URL for the logo
 */
export async function getLogoBase64(): Promise<string> {
  return getBase64Image('public/static/logo.png');
}

/**
 * Get mode icon as base64 data URL
 * @param mode - Chat mode ID (analyzing, brainstorming, debating, solving)
 * @returns Base64 data URL for the mode icon
 */
export async function getModeIconBase64(mode: string): Promise<string> {
  try {
    return await getBase64Image(`public/static/icons/modes/${mode}.svg`);
  } catch {
    // Fallback to analyzing icon
    return getBase64Image('public/static/icons/modes/analyzing.svg');
  }
}

/**
 * Get UI icon as base64 data URL
 * @param iconName - Icon name (robot, message, etc.)
 * @returns Base64 data URL for the UI icon
 */
export async function getUIIconBase64(iconName: string): Promise<string> {
  return getBase64Image(`public/static/icons/ui/${iconName}.svg`);
}

/**
 * Design system colors for OG images
 * Extracted from BRAND constants for consistency
 */
export const OG_COLORS = {
  // Background
  background: '#000000',
  backgroundGradientStart: '#0a0a0a',
  backgroundGradientEnd: '#1a1a1a',

  // Brand colors
  primary: BRAND.colors.primary, // #2563eb
  secondary: BRAND.colors.secondary, // #64748b

  // Text colors
  textPrimary: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',

  // Glass-morphism
  glassBackground: 'rgba(24, 24, 27, 0.8)', // #18181b with opacity
  glassBorder: 'rgba(255, 255, 255, 0.1)',
  glassHighlight: 'rgba(255, 255, 255, 0.05)',

  // Mode-specific colors
  analyzing: '#8b5cf6', // Purple
  brainstorming: '#f59e0b', // Amber
  debating: '#ef4444', // Red
  solving: '#10b981', // Green

  // Status colors
  success: '#22c55e', // Green
  warning: '#f59e0b', // Amber
  error: '#ef4444', // Red
  info: '#3b82f6', // Blue
} as const;

/**
 * Get color for chat mode
 * @param mode - Chat mode ID
 * @returns Hex color string
 */
export function getModeColor(mode: string): string {
  const modeColors: Record<string, string> = {
    analyzing: OG_COLORS.analyzing,
    brainstorming: OG_COLORS.brainstorming,
    debating: OG_COLORS.debating,
    solving: OG_COLORS.solving,
  };

  return modeColors[mode as keyof typeof modeColors] || OG_COLORS.primary;
}

/**
 * Glass-morphism CSS properties for OG images
 * Creates the signature glass-like appearance
 */
export const glassStyle = {
  background: OG_COLORS.glassBackground,
  border: `1px solid ${OG_COLORS.glassBorder}`,
  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
  backdropFilter: 'blur(8px)',
};

/**
 * Create a gradient background string
 */
export function createGradient(angle: number = 135, start: string = OG_COLORS.backgroundGradientStart, end: string = OG_COLORS.backgroundGradientEnd): string {
  return `linear-gradient(${angle}deg, ${start} 0%, ${end} 100%)`;
}

/**
 * Generate SVG path data for wavy lines
 * Creates organic, flowing wave patterns for OG images
 *
 * Algorithm:
 * - Uses multi-octave sine waves to approximate organic noise
 * - Centers at: y + h * 0.5 (vertical center)
 * - Line width: 40px
 * - Step: x += 5
 *
 * @param width - Canvas width
 * @param height - Canvas height
 * @param waveIndex - Wave layer index (0-4)
 * @returns SVG path data string
 */
export function generateWavePath(width: number, height: number, waveIndex: number): string {
  // Center waves vertically
  const centerY = height * 0.5;
  const amplitude = 80; // Match canvas amplitude exactly

  // Simulate simplex noise with layered sine waves
  // Simplex noise has organic, flowing characteristics that we approximate with multiple frequencies
  const path: string[] = [];

  for (let x = 0; x < width; x += 5) {
    // Approximate simplex noise(x / 800, 0.3 * i, nt=0) using sine waves
    // Scale x exactly as in the canvas version
    const scaledX = x / 800;
    const yOffset = 0.3 * waveIndex;

    // Enhanced multi-octave noise approximation with phase shifts
    // This creates more organic, varied waves without a visible centerline

    // Layer 1: Base wave (low frequency, high amplitude)
    const noise1 = Math.sin((scaledX + yOffset) * Math.PI * 2);

    // Layer 2: Mid frequency detail with phase shift
    const noise2 = Math.sin((scaledX * 3 + yOffset * 1.3) * Math.PI * 2) * 0.4;

    // Layer 3: High frequency texture with different phase
    const noise3 = Math.sin((scaledX * 5.7 + yOffset * 1.7) * Math.PI * 2) * 0.2;

    // Layer 4: Fine detail with asymmetric frequency
    const noise4 = Math.sin((scaledX * 8.3 + yOffset * 2.1) * Math.PI * 2) * 0.1;

    // Layer 5: Extra fine detail for smoothness
    const noise5 = Math.sin((scaledX * 13.1 + yOffset * 2.5) * Math.PI * 2) * 0.05;

    // Combine all layers with proper normalization
    const noiseValue = (noise1 + noise2 + noise3 + noise4 + noise5) / 1.75;

    // Apply amplitude and center position (matches canvas: y + h * 0.5)
    const y = noiseValue * amplitude + centerY;

    // Build SVG path (M for first point, L for rest)
    if (x === 0) {
      path.push(`M${x},${y.toFixed(2)}`);
    } else {
    // Intentionally empty
      path.push(`L${x},${y.toFixed(2)}`);
    }
  }

  return path.join(' ');
}

/**
 * Wavy background colors
 * Roundtable logo colors - muted/desaturated versions
 */
export const WAVE_COLORS = [
  'rgba(218, 165, 32, 0.15)', // Muted Gold/Yellow
  'rgba(154, 205, 50, 0.15)', // Muted Olive Green
  'rgba(64, 224, 208, 0.15)', // Muted Turquoise
  'rgba(147, 112, 219, 0.15)', // Muted Purple
  'rgba(219, 112, 147, 0.15)', // Muted Pink
] as const;

/**
 * Truncate text with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncating
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength)
    return text;
  return `${text.slice(0, maxLength)}...`;
}
