#!/usr/bin/env tsx
/**
 * Pre-build Script
 *
 * Runs before each build to clear Next.js cache for fresh builds
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
