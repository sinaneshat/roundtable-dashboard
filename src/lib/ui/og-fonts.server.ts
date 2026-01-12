/**
 * OG Image Font Loader (Edge-compatible)
 *
 * Loads Geist fonts via fetch from public folder.
 * Compatible with Cloudflare Workers and edge runtimes.
 *
 * Fonts served from: /public/static/fonts/
 */

import { getAppBaseUrl } from '@/lib/config/base-urls';

export type OGFontConfig = {
  name: string;
  data: ArrayBuffer;
  style: 'normal' | 'italic';
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
};

/**
 * Fetch a font file from the public folder
 */
async function fetchFont(fontName: string): Promise<ArrayBuffer> {
  const baseUrl = getAppBaseUrl();
  const fontUrl = `${baseUrl}/static/fonts/${fontName}`;

  const response = await fetch(fontUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch font ${fontName}: ${response.status}`);
  }

  return response.arrayBuffer();
}

/**
 * Loads fonts for OG image generation via fetch.
 * Uses Geist TTF fonts (Satori only supports TTF/OTF, not WOFF2).
 * Fonts served from public/static/fonts/ directory.
 */
export async function getOGFonts(): Promise<OGFontConfig[]> {
  const [regular, semibold, bold, black] = await Promise.all([
    fetchFont('Geist-Regular.ttf'),
    fetchFont('Geist-SemiBold.ttf'),
    fetchFont('Geist-Bold.ttf'),
    fetchFont('Geist-Black.ttf'),
  ]);

  return [
    { name: 'Geist', data: regular, style: 'normal', weight: 400 },
    { name: 'Geist', data: semibold, style: 'normal', weight: 600 },
    { name: 'Geist', data: bold, style: 'normal', weight: 700 },
    { name: 'Geist', data: black, style: 'normal', weight: 800 },
  ];
}
