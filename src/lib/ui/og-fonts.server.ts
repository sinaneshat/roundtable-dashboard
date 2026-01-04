/**
 * OG Image Font Loader (Server-only)
 *
 * Fetches Geist fonts from jsDelivr CDN.
 * This is the most reliable approach for Cloudflare builds.
 */

export type OGFontConfig = {
  name: string;
  data: ArrayBuffer;
  style: 'normal' | 'italic';
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
};

// Geist font TTF URLs from jsDelivr CDN
const FONT_BASE_URL = 'https://cdn.jsdelivr.net/npm/geist@1.5.1/dist/fonts/geist-sans';

async function fetchFont(filename: string): Promise<ArrayBuffer> {
  const url = `${FONT_BASE_URL}/${filename}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch font ${filename}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();

  // Validate font data - TTF files start with specific bytes
  const view = new DataView(arrayBuffer);
  if (arrayBuffer.byteLength < 4) {
    throw new Error(`Font ${filename} is too small: ${arrayBuffer.byteLength} bytes`);
  }

  // TTF/OTF magic numbers: 0x00010000 (TrueType) or 0x4F54544F (OpenType "OTTO")
  const magic = view.getUint32(0);
  if (magic !== 0x00010000 && magic !== 0x4F54544F) {
    throw new Error(`Font ${filename} has invalid magic number: 0x${magic.toString(16)}`);
  }

  return arrayBuffer;
}

/**
 * Fetches fonts for OG image generation from jsDelivr CDN.
 * Uses Geist TTF fonts (Satori only supports TTF/OTF, not WOFF2).
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
