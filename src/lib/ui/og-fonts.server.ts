/**
 * OG Image Font Loader (Server-only)
 *
 * This file uses Node.js fs module and must only be imported
 * in server-side contexts (OG image routes, not client components).
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type OGFontConfig = {
  name: string;
  data: ArrayBuffer;
  style: 'normal' | 'italic';
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
};

/**
 * Loads fonts for OG image generation from local files.
 * Uses Geist TTF fonts bundled in public/fonts/ (Satori only supports TTF/OTF, not WOFF2).
 *
 * NOTE: This function uses Node.js fs and must only be called from server-side code.
 */
export async function getOGFonts(): Promise<OGFontConfig[]> {
  const fontsDir = join(process.cwd(), 'public', 'fonts');

  const [regular, semibold, bold, black] = await Promise.all([
    readFile(join(fontsDir, 'Geist-Regular.ttf')),
    readFile(join(fontsDir, 'Geist-SemiBold.ttf')),
    readFile(join(fontsDir, 'Geist-Bold.ttf')),
    readFile(join(fontsDir, 'Geist-Black.ttf')),
  ]);

  return [
    { name: 'Geist', data: regular.buffer as ArrayBuffer, style: 'normal', weight: 400 },
    { name: 'Geist', data: semibold.buffer as ArrayBuffer, style: 'normal', weight: 600 },
    { name: 'Geist', data: bold.buffer as ArrayBuffer, style: 'normal', weight: 700 },
    { name: 'Geist', data: black.buffer as ArrayBuffer, style: 'normal', weight: 800 },
  ];
}
