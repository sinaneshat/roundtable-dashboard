#!/usr/bin/env tsx
/**
 * Find Unused Translation Keys Script
 * 
 * Scans the codebase to find translation keys that are defined
 * but never used in any components or files.
 */

import { glob } from 'glob';
import fs from 'node:fs';
import path from 'node:path';

const TRANSLATION_FILE = path.join(process.cwd(), 'src/i18n/locales/en/common.json');
const SOURCE_DIRS = ['src/components', 'src/app', 'src/containers', 'src/lib'];

interface UnusedKeysResult {
  totalKeys: number;
  usedKeys: number;
  unusedKeys: string[];
  usageCount: Record<string, number>;
}

function flattenObject(obj: any, prefix = ''): string[] {
  const result: string[] = [];
  
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      result.push(...flattenObject(obj[key], fullKey));
    } else {
      result.push(fullKey);
    }
  }
  
  return result;
}

async function getAllSourceFiles(): Promise<string[]> {
  const patterns = SOURCE_DIRS.map(dir => `${dir}/**/*.{ts,tsx,js,jsx}`);
  const files: string[] = [];
  
  for (const pattern of patterns) {
    const matches = await glob(pattern, { 
      cwd: process.cwd(),
      ignore: ['**/node_modules/**', '**/.next/**', '**/dist/**']
    });
    files.push(...matches);
  }
  
  return files;
}

function findKeyUsageInContent(content: string, key: string): boolean {
  // Match different patterns of translation key usage:
  // 1. t('key') or t("key")
  // 2. t(`key`)
  // 3. In objects or parameters: key: 'value'
  // 4. Nested keys with dots: t('parent.child')
  
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Pattern 1: Direct string literals
  const directPattern = new RegExp(`t\\(['"\`]${escapedKey}['"\`][),]`, 'g');
  if (directPattern.test(content)) return true;
  
  // Pattern 2: As part of interpolation or template literals
  const templatePattern = new RegExp(`['"\`]${escapedKey}['"\`]`, 'g');
  if (templatePattern.test(content)) return true;
  
  // Pattern 3: In useTranslations hook namespace
  const namespacePattern = new RegExp(`useTranslations\\(['"\`]${escapedKey}['"\`]\\)`, 'g');
  if (namespacePattern.test(content)) return true;
  
  return false;
}

async function findUnusedKeys(): Promise<UnusedKeysResult> {
  // Read translation file
  const translationContent = fs.readFileSync(TRANSLATION_FILE, 'utf-8');
  const translations = JSON.parse(translationContent);
  
  // Get all translation keys
  const allKeys = flattenObject(translations);
  console.log(`📝 Found ${allKeys.length} translation keys`);
  
  // Get all source files
  const sourceFiles = await getAllSourceFiles();
  console.log(`📂 Scanning ${sourceFiles.length} source files...\n`);
  
  // Track usage of each key
  const usageCount: Record<string, number> = {};
  allKeys.forEach(key => usageCount[key] = 0);
  
  // Scan all files for key usage
  for (const file of sourceFiles) {
    const filePath = path.join(process.cwd(), file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    for (const key of allKeys) {
      if (findKeyUsageInContent(content, key)) {
        usageCount[key]++;
      }
    }
  }
  
  // Find unused keys
  const unusedKeys = allKeys.filter(key => usageCount[key] === 0);
  
  return {
    totalKeys: allKeys.length,
    usedKeys: allKeys.length - unusedKeys.length,
    unusedKeys,
    usageCount,
  };
}

// Run the analysis
console.log('🔍 Finding unused translation keys...\n');

findUnusedKeys().then(result => {
  console.log('📊 Results:');
  console.log(`  Total translation keys: ${result.totalKeys}`);
  console.log(`  Used keys: ${result.usedKeys}`);
  console.log(`  Unused keys: ${result.unusedKeys.length}`);
  
  if (result.unusedKeys.length > 0) {
    console.log('\n⚠️  Unused translation keys:');
    
    // Group by namespace (top-level key)
    const grouped: Record<string, string[]> = {};
    result.unusedKeys.forEach(key => {
      const namespace = key.split('.')[0];
      if (!grouped[namespace]) {
        grouped[namespace] = [];
      }
      grouped[namespace].push(key);
    });
    
    // Print grouped results
    for (const [namespace, keys] of Object.entries(grouped).sort()) {
      console.log(`\n  ${namespace} (${keys.length} keys):`);
      keys.slice(0, 10).forEach(key => {
        console.log(`    - ${key}`);
      });
      if (keys.length > 10) {
        console.log(`    ... and ${keys.length - 10} more`);
      }
    }
    
    console.log('\n💡 Tip: You can safely remove these keys from common.json to reduce file size.');
  } else {
    console.log('\n✅ All translation keys are being used!');
  }
  
  // Find rarely used keys (might be candidates for removal)
  const rarelyUsed = Object.entries(result.usageCount)
    .filter(([, count]) => count === 1)
    .map(([key]) => key);
  
  if (rarelyUsed.length > 0) {
    console.log(`\nℹ️  ${rarelyUsed.length} keys are used only once (consider if they're necessary)`);
  }
}).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
