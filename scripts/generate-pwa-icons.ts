#!/usr/bin/env tsx
/**
 * Generate PWA icons from source logo
 * Creates multiple sizes required for PWA manifest
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ICON_SIZES = [
  { size: 72, name: 'icon-72x72.png' },
  { size: 96, name: 'icon-96x96.png' },
  { size: 128, name: 'icon-128x128.png' },
  { size: 144, name: 'icon-144x144.png' },
  { size: 152, name: 'icon-152x152.png' },
  { size: 192, name: 'icon-192x192.png' },
  { size: 384, name: 'icon-384x384.png' },
  { size: 512, name: 'icon-512x512.png' },
];

const MASKABLE_SIZES = [
  { size: 192, name: 'icon-maskable-192x192.png' },
  { size: 512, name: 'icon-maskable-512x512.png' },
];

// Use the colorful gradient logo as source
const SOURCE_LOGO = path.join(process.cwd(), 'public/static/logo.png');
const OUTPUT_DIR = path.join(process.cwd(), 'public/icons');

async function generateIcons() {
  console.log('🎨 Generating PWA icons...\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Check if source logo exists
  if (!fs.existsSync(SOURCE_LOGO)) {
    console.error(`❌ Source logo not found at: ${SOURCE_LOGO}`);
    process.exit(1);
  }

  try {
    // Generate standard icons with transparent backgrounds
    console.log('📱 Generating standard icons with transparent backgrounds...');
    for (const { size, name } of ICON_SIZES) {
      const outputPath = path.join(OUTPUT_DIR, name);
      await sharp(SOURCE_LOGO)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }, // Transparent background
        })
        .png()
        .toFile(outputPath);

      console.log(`  ✓ Generated ${name} (${size}x${size})`);
    }

    // Generate maskable icons (with padding for safe area and opaque background)
    console.log('\n🎭 Generating maskable icons with safe area padding...');
    for (const { size, name } of MASKABLE_SIZES) {
      const outputPath = path.join(OUTPUT_DIR, name);
      const padding = Math.floor(size * 0.1); // 10% padding for safe area

      await sharp(SOURCE_LOGO)
        .resize(size - padding * 2, size - padding * 2, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .extend({
          top: padding,
          bottom: padding,
          left: padding,
          right: padding,
          background: { r: 15, g: 23, b: 42, alpha: 1 }, // Opaque for maskable
        })
        .png()
        .toFile(outputPath);

      console.log(`  ✓ Generated ${name} (${size}x${size} with safe area)`);
    }

    console.log('\n✅ All PWA icons generated successfully!');
    console.log(`📂 Icons saved to: ${OUTPUT_DIR}`);
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
