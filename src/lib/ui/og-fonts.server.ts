/**
 * OG Image Font Loader (Server-only)
 *
 * This file uses Node.js fs module and must only be imported
 * in server-side contexts (OG image routes, not client components).
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
 * Converts a Node.js Buffer to a proper ArrayBuffer.
 * Buffer.buffer returns a view into a shared ArrayBuffer with potential offsets,
 * so we need to copy to a new ArrayBuffer to avoid offset issues.
 */
function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return new Uint8Array(buffer).buffer;
}

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
    { name: 'Geist', data: bufferToArrayBuffer(regular), style: 'normal', weight: 400 },
    { name: 'Geist', data: bufferToArrayBuffer(semibold), style: 'normal', weight: 600 },
    { name: 'Geist', data: bufferToArrayBuffer(bold), style: 'normal', weight: 700 },
    { name: 'Geist', data: bufferToArrayBuffer(black), style: 'normal', weight: 800 },
  ];
}
