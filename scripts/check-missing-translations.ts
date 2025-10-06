#!/usr/bin/env tsx
/**
 * Check Missing Translations Script
 * 
 * Scans the codebase to find translation keys that are used in code
 * but not defined in the translation file.
 */

import { glob } from 'glob';
import fs from 'node:fs';
import path from 'node:path';

const TRANSLATION_FILE = path.join(process.cwd(), 'src/i18n/locales/en/common.json');
const SOURCE_DIRS = ['src/components', 'src/app', 'src/containers', 'src/lib'];

interface MissingKey {
  key: string;
  files: Array<{
    file: string;
    line: number;
    context: string;
  }>;
}

interface MissingTranslationsResult {
  totalKeys: number;
  missingKeys: MissingKey[];
}

function flattenObject(obj: any, prefix = ''): Set<string> {
  const result = new Set<string>();
  
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      flattenObject(obj[key], fullKey).forEach(k => result.add(k));
    } else {
      result.add(fullKey);
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

function extractTranslationKeys(content: string): string[] {
  const keys: string[] = [];
  
  // Pattern 1: t('key') or t("key")
  const directPattern = /t\(['"]([^'"]+)['"]\)/g;
  let match;
  
  while ((match = directPattern.exec(content)) !== null) {
    keys.push(match[1]);
  }
  
  // Pattern 2: t(`key`) - template literals
  const templatePattern = /t\(`([^`]+)`\)/g;
  
  while ((match = templatePattern.exec(content)) !== null) {
    // Extract the key part (before any ${} interpolation)
    const key = match[1].split('${')[0];
    if (key && !key.includes('{')) {
      keys.push(key);
    }
  }
  
  // Pattern 3: useTranslations('namespace')
  const namespacePattern = /useTranslations\(['"]([^'"]+)['"]\)/g;
  
  while ((match = namespacePattern.exec(content)) !== null) {
    keys.push(match[1]);
  }
  
  // Pattern 4: Dynamic key construction - t(someVar + '.key')
  // We'll skip these as they're too complex to analyze statically
  
  return keys;
}

async function checkMissingTranslations(): Promise<MissingTranslationsResult> {
  // Read translation file
  const translationContent = fs.readFileSync(TRANSLATION_FILE, 'utf-8');
  const translations = JSON.parse(translationContent);
  
  // Get all existing translation keys
  const existingKeys = flattenObject(translations);
  console.log(`📝 Found ${existingKeys.size} existing translation keys`);
  
  // Get all source files
  const sourceFiles = await getAllSourceFiles();
  console.log(`📂 Scanning ${sourceFiles.length} source files...\n`);
  
  // Track keys used in code
  const usedKeys = new Map<string, Array<{ file: string; line: number; context: string }>>();
  
  for (const file of sourceFiles) {
    const filePath = path.join(process.cwd(), file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    // Extract keys from this file
    const keys = extractTranslationKeys(content);
    
    for (const key of keys) {
      if (!usedKeys.has(key)) {
        usedKeys.set(key, []);
      }
      
      // Find the line number where this key is used
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(key)) {
          usedKeys.get(key)!.push({
            file: path.relative(process.cwd(), filePath),
            line: i + 1,
            context: lines[i].trim(),
          });
          break;
        }
      }
    }
  }
  
  // Find missing keys
  const missingKeys: MissingKey[] = [];
  
  for (const [key, locations] of usedKeys.entries()) {
    // Check if key exists (exact match or as a namespace)
    const keyExists = existingKeys.has(key) || 
                     Array.from(existingKeys).some(existingKey => existingKey.startsWith(key + '.'));
    
    if (!keyExists) {
      missingKeys.push({
        key,
        files: locations,
      });
    }
  }
  
  return {
    totalKeys: usedKeys.size,
    missingKeys,
  };
}

// Run the analysis
console.log('🔍 Checking for missing translation keys...\n');

checkMissingTranslations().then(result => {
  console.log('📊 Results:');
  console.log(`  Total keys used in code: ${result.totalKeys}`);
  console.log(`  Missing keys: ${result.missingKeys.length}`);
  
  if (result.missingKeys.length > 0) {
    console.log('\n❌ Missing translation keys (used in code but not defined):');
    
    // Sort by number of usages
    const sorted = result.missingKeys.sort((a, b) => b.files.length - a.files.length);
    
    sorted.forEach(item => {
      console.log(`\n  ⚠️  "${item.key}" (used in ${item.files.length} location${item.files.length > 1 ? 's' : ''}):`);
      
      item.files.slice(0, 3).forEach(location => {
        console.log(`      ${location.file}:${location.line}`);
        console.log(`        ${location.context.substring(0, 80)}${location.context.length > 80 ? '...' : ''}`);
      });
      
      if (item.files.length > 3) {
        console.log(`      ... and ${item.files.length - 3} more locations`);
      }
    });
    
    console.log('\n💡 Add these keys to src/i18n/locales/en/common.json');
  } else {
    console.log('\n✅ All translation keys used in code are properly defined!');
  }
}).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
