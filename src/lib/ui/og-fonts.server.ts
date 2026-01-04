/**
 * OG Image Font Loader (Server-only)
 *
 * Loads fonts synchronously at module initialization time.
 * This runs during build, making fonts available for static OG image generation.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type OGFontConfig = {
  name: string;
  data: ArrayBuffer;
  style: 'normal' | 'italic';
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
};

// Get the directory of this module
const __dirname = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(__dirname, '../../assets/fonts');

// Load fonts synchronously at module initialization (runs during build)
function loadFont(filename: string): ArrayBuffer {
  const buffer = readFileSync(join(fontsDir, filename));
  // Convert Buffer to ArrayBuffer properly (avoid shared buffer offset issues)
  return new Uint8Array(buffer).buffer;
}

// Pre-load all fonts at module initialization
const fontData = {
  regular: loadFont('Geist-Regular.ttf'),
  semibold: loadFont('Geist-SemiBold.ttf'),
  bold: loadFont('Geist-Bold.ttf'),
  black: loadFont('Geist-Black.ttf'),
};

/**
 * Returns pre-loaded fonts for OG image generation.
 * Fonts are loaded synchronously when this module is first imported.
 */
export async function getOGFonts(): Promise<OGFontConfig[]> {
  return [
    { name: 'Geist', data: fontData.regular, style: 'normal', weight: 400 },
    { name: 'Geist', data: fontData.semibold, style: 'normal', weight: 600 },
    { name: 'Geist', data: fontData.bold, style: 'normal', weight: 700 },
    { name: 'Geist', data: fontData.black, style: 'normal', weight: 800 },
  ];
}
