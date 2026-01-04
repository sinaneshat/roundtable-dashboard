/**
 * OG Image Font Loader (Server-only)
 *
 * Loads Geist fonts from local filesystem using Node.js fs APIs.
 * This follows the Next.js 16 recommended pattern for OG image fonts.
 */

import type { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type OGFontConfig = {
  name: string;
  data: ArrayBuffer;
  style: 'normal' | 'italic';
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
};

/**
 * Converts a Node.js Buffer to an ArrayBuffer.
 * Buffer.buffer may have extra data, so we slice to get only the relevant portion.
 */
function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

/**
 * Loads fonts for OG image generation from local filesystem.
 * Uses Geist TTF fonts (Satori only supports TTF/OTF, not WOFF2).
 * Fonts are located in src/assets/fonts/ directory.
 */
export async function getOGFonts(): Promise<OGFontConfig[]> {
  const fontsDir = join(process.cwd(), 'src/assets/fonts');

  const [regular, semibold, bold, black] = await Promise.all([
    readFile(join(fontsDir, 'Geist-Regular.ttf')),
    readFile(join(fontsDir, 'Geist-SemiBold.ttf')),
    readFile(join(fontsDir, 'Geist-Bold.ttf')),
    readFile(join(fontsDir, 'Geist-Black.ttf')),
  ]);

  return [
    { name: 'Geist', data: bufferToArrayBuffer(regular), style: 'normal', weight: 400 },
    { name: 'Geist', data: bufferToArrayBuffer(semibold), style: 'normal', weight: 600 },
    { name: 'Geist', data: bufferToArrayBuffer(bold), style: 'normal', weight: 700 },
    { name: 'Geist', data: bufferToArrayBuffer(black), style: 'normal', weight: 800 },
  ];
}
