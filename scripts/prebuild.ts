#!/usr/bin/env tsx
/**
 * Pre-build Script
 *
 * Runs before each build to:
 * 1. Generate build timestamp
 * 2. Clear Next.js cache
 * 3. Prepare version info
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT_DIR = join(__dirname, '..');
const ENV_FILE = join(ROOT_DIR, '.env');

// Generate build timestamp
const buildTimestamp = Date.now().toString();

console.log('🚀 Pre-build setup started...\n');

// 1. Set build timestamp in .env
console.log('📅 Setting build timestamp:', buildTimestamp);
try {
  let envContent = '';

  try {
    envContent = readFileSync(ENV_FILE, 'utf-8');
  } catch {
    console.log('   ℹ️  No .env file found, creating new one');
  }

  // Update or add BUILD_TIMESTAMP
  const timestampLine = `NEXT_PUBLIC_BUILD_TIMESTAMP=${buildTimestamp}`;

  if (envContent.includes('NEXT_PUBLIC_BUILD_TIMESTAMP=')) {
    envContent = envContent.replace(
      /NEXT_PUBLIC_BUILD_TIMESTAMP=.*/g,
      timestampLine
    );
  } else {
    envContent += `\n${timestampLine}\n`;
  }

  writeFileSync(ENV_FILE, envContent);
  console.log('   ✅ Build timestamp set\n');
} catch (error) {
  console.error('   ❌ Failed to set build timestamp:', error);
}

// 2. Clear Next.js build cache
console.log('🗑️  Clearing Next.js build cache...');
try {
  execSync('rm -rf .next', { cwd: ROOT_DIR, stdio: 'inherit' });
  console.log('   ✅ Next.js cache cleared\n');
} catch (error) {
  console.log('   ℹ️  No cache to clear\n');
}

console.log('✨ Pre-build setup complete!\n');
