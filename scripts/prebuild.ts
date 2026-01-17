#!/usr/bin/env tsx
/**
 * Pre-build Script
 *
 * Runs before each build to:
 * 1. Clear Next.js cache for fresh builds
 * 2. Generate OG image fonts (base64 embedded)
 * 3. Generate service worker with build-time cache version
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT_DIR = join(__dirname, '..');

// Clear Next.js cache
try {
  execSync('rm -rf .next', { cwd: ROOT_DIR, stdio: 'inherit' });
} catch {
  // No cache to clear
}

// Generate OG assets (fonts + images embedded as base64 for edge compatibility)
try {
  console.log('Generating OG assets (fonts + images)...');
  execSync('npx tsx scripts/generate-og-assets.ts', { cwd: ROOT_DIR, stdio: 'inherit' });
} catch (error) {
  console.error('Failed to generate OG assets:', error);
}

// Generate service worker with build-time cache version
// This ensures users get fresh assets after each deploy
try {
  console.log('Generating service worker with cache version...');
  execSync('npx tsx scripts/generate-sw.ts', { cwd: ROOT_DIR, stdio: 'inherit' });
} catch (error) {
  console.error('Failed to generate service worker:', error);
}
