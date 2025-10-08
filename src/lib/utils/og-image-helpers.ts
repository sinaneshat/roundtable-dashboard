/**
 * Open Graph Image Generation Helpers
 * Utilities for creating beautiful, branded OG images with Next.js ImageResponse
 *
 * Features:
 * - Base64 encoding for local assets (logo, model icons)
 * - Design system color extraction
 * - Glass-morphism styling helpers
 * - Model icon path resolution
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { BRAND } from '@/constants/brand';

/**
 * Read and base64 encode a local image file
 * ImageResponse supports base64 data URLs for <img> tags
 *
 * @param relativePath - Path relative to project root (e.g., 'public/static/logo.png')
 * @returns Base64 data URL string
 */
export async function getBase64Image(relativePath: string): Promise<string> {
  try {
    const filePath = join(process.cwd(), relativePath);
    const imageBuffer = await readFile(filePath);
    const base64 = imageBuffer.toString('base64');

    // Determine MIME type from file extension
    const ext = relativePath.split('.').pop()?.toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';

    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error(`Failed to read image: ${relativePath}`, error);
    throw error;
  }
}

/**
 * Get model icon path from model ID
 * Maps OpenRouter model IDs to local icon files
 *
 * Model ID format: "provider/model-name"
 * Icon path: "public/static/icons/ai-models/{provider}.png"
 *
 * @param modelId - OpenRouter model ID (e.g., "anthropic/claude-3.5-sonnet")
 * @returns Base64 data URL for the model icon
 */
export async function getModelIconBase64(modelId: string): Promise<string> {
  const provider = getProviderFromModelId(modelId);
  const iconPath = `public/static/icons/ai-models/${provider}.png`;

  try {
    return await getBase64Image(iconPath);
  } catch (error) {
    console.error(`Failed to load icon for model: ${modelId}`, error);
    // Fallback: return a default icon or empty string
    return '';
  }
}

/**
 * Extract provider name from OpenRouter model ID
 *
 * @param modelId - OpenRouter model ID (e.g., "anthropic/claude-3.5-sonnet")
 * @returns Provider name (e.g., "anthropic")
 */
export function getProviderFromModelId(modelId: string): string {
  const [provider] = modelId.split('/');

  if (!provider) {
    return 'unknown';
  }

  // Map provider prefixes to icon filenames
  const providerMap: Record<string, string> = {
    'anthropic': 'anthropic',
    'openai': 'openai',
    'google': 'gemini',
    'meta-llama': 'meta',
    'deepseek': 'deepseek',
    'x-ai': 'xai',
    'perplexity': 'perplexity',
  };

  return providerMap[provider] || provider;
}

/**
 * Get Roundtable logo as base64 data URL
 * @returns Base64 data URL for the logo
 */
export async function getLogoBase64(): Promise<string> {
  return getBase64Image('public/static/logo.png');
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

/**
 * Get display name for AI model
 * Extracts a human-readable name from model ID
 *
 * @param modelId - OpenRouter model ID
 * @returns Display name
 */
export function getModelDisplayName(modelId: string): string {
  const [, model] = modelId.split('/');

  if (!model) {
    return modelId;
  }

  // Clean up model name
  const cleanModel = model
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());

  return cleanModel;
}
