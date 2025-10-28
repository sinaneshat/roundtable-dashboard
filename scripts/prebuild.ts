#!/usr/bin/env tsx
/**
 * Pre-build Script
 *
 * Runs before each build to clear Next.js cache
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT_DIR = join(__dirname, '..');

console.log('🚀 Pre-build setup started...\n');

// Clear Next.js build cache
console.log('🗑️  Clearing Next.js build cache...');
try {
  execSync('rm -rf .next', { cwd: ROOT_DIR, stdio: 'inherit' });
  console.log('   ✅ Next.js cache cleared\n');
} catch {
  console.log('   ℹ️  No cache to clear\n');
}

console.log('✨ Pre-build setup complete!\n');
