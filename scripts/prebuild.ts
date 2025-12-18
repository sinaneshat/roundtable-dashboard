#!/usr/bin/env tsx
/**
 * Pre-build Script
 *
 * Runs before each build to:
 * 1. Clear Next.js cache for fresh builds
 * 2. Generate service worker version for cache invalidation
 * 3. Set Node.js memory limit for builds
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT_DIR = join(__dirname, '..');

// Set Node.js memory limit for build (required for Cloudflare Pages)
// This prevents heap out of memory errors during Next.js build
if (!process.env.NODE_OPTIONS) {
  process.env.NODE_OPTIONS = '--max-old-space-size=4096';
}

// Clear Next.js cache
try {
  execSync('rm -rf .next', { cwd: ROOT_DIR, stdio: 'inherit' });
} catch {
  // No cache to clear
}

// Generate service worker version for cache invalidation
// This ensures every build produces a unique SW that triggers updates
const swVersion = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
const buildTime = new Date().toISOString();

// Export as environment variables for the build process
process.env.NEXT_PUBLIC_SW_VERSION = swVersion;
process.env.NEXT_PUBLIC_BUILD_TIME = buildTime;
