#!/usr/bin/env tsx
/**
 * Fix Translations Script
 * 
 * Automatically fixes translation issues:
 * 1. Removes unused translation keys
 * 2. Adds missing translation keys with placeholder values
 * 3. Creates a backup of the original file
 */

import { glob } from 'glob';
import fs from 'node:fs';
import path from 'node:path';

const TRANSLATION_FILE = path.join(process.cwd(), 'src/i18n/locales/en/common.json');
const BACKUP_FILE = path.join(process.cwd(), 'src/i18n/locales/en/common.json.backup');
const SOURCE_DIRS = ['src/components', 'src/app', 'src/containers', 'src/lib'];

interface FixResults {
  removedKeys: string[];
  addedKeys: string[];
  originalKeyCount: number;
  finalKeyCount: number;
}

function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      Object.assign(result, flattenObject(obj[key], fullKey));
    } else {
      result[fullKey] = obj[key];
    }
  }
  
  return result;
}

function unflattenObject(flatObj: Record<string, any>): any {
  const result: any = {};
  
  for (const [key, value] of Object.entries(flatObj)) {
    const parts = key.split('.');
    let current = result;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
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
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const directPattern = new RegExp(`t\\(['"\`]${escapedKey}['"\`][),]`, 'g');
  if (directPattern.test(content)) return true;
  
  const templatePattern = new RegExp(`['"\`]${escapedKey}['"\`]`, 'g');
  if (templatePattern.test(content)) return true;
  
  const namespacePattern = new RegExp(`useTranslations\\(['"\`]${escapedKey}['"\`]\\)`, 'g');
  if (namespacePattern.test(content)) return true;
  
  return false;
}

function extractTranslationKeys(content: string): string[] {
  const keys: string[] = [];
  
  const directPattern = /t\(['"]([^'"]+)['"]\)/g;
  let match;
  
  while ((match = directPattern.exec(content)) !== null) {
    keys.push(match[1]);
  }
  
  const templatePattern = /t\(`([^`]+)`\)/g;
  
  while ((match = templatePattern.exec(content)) !== null) {
    const key = match[1].split('${')[0];
    if (key && !key.includes('{')) {
      keys.push(key);
    }
  }
  
  const namespacePattern = /useTranslations\(['"]([^'"]+)['"]\)/g;
  
  while ((match = namespacePattern.exec(content)) !== null) {
    keys.push(match[1]);
  }
  
  return keys;
}

function generateTranslationValue(key: string): string {
  // Generate a human-readable translation value from the key
  const parts = key.split('.');
  const lastPart = parts[parts.length - 1];
  
  // Convert camelCase to Title Case with spaces
  return lastPart
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

async function fixTranslations(removeUnused: boolean = true, addMissing: boolean = true): Promise<FixResults> {
  console.log('📝 Reading translation file...');
  
  // Create backup
  const originalContent = fs.readFileSync(TRANSLATION_FILE, 'utf-8');
  fs.writeFileSync(BACKUP_FILE, originalContent, 'utf-8');
  console.log(`✅ Backup created: ${path.relative(process.cwd(), BACKUP_FILE)}`);
  
  const translations = JSON.parse(originalContent);
  const flatTranslations = flattenObject(translations);
  const originalKeyCount = Object.keys(flatTranslations).length;
  
  console.log(`📊 Original key count: ${originalKeyCount}`);
  
  // Get all source files
  const sourceFiles = await getAllSourceFiles();
  console.log(`📂 Scanning ${sourceFiles.length} source files...\n`);
  
  // Find used keys
  const usedKeys = new Set<string>();
  const allUsedKeys = new Set<string>();
  
  for (const file of sourceFiles) {
    const filePath = path.join(process.cwd(), file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Extract keys used in this file
    const keysInFile = extractTranslationKeys(content);
    keysInFile.forEach(key => allUsedKeys.add(key));
    
    // Check which defined keys are used
    for (const key of Object.keys(flatTranslations)) {
      if (findKeyUsageInContent(content, key)) {
        usedKeys.add(key);
        
        // Also mark all parent namespaces as used
        const parts = key.split('.');
        for (let i = 1; i < parts.length; i++) {
          usedKeys.add(parts.slice(0, i).join('.'));
        }
      }
    }
  }
  
  const results: FixResults = {
    removedKeys: [],
    addedKeys: [],
    originalKeyCount,
    finalKeyCount: 0,
  };
  
  // Remove unused keys
  if (removeUnused) {
    console.log('🧹 Removing unused keys...');
    for (const key of Object.keys(flatTranslations)) {
      if (!usedKeys.has(key)) {
        // Check if it's a namespace (has children that are used)
        const isNamespace = Array.from(usedKeys).some(usedKey => 
          usedKey.startsWith(key + '.')
        );
        
        if (!isNamespace) {
          delete flatTranslations[key];
          results.removedKeys.push(key);
        }
      }
    }
    console.log(`✅ Removed ${results.removedKeys.length} unused keys`);
  }
  
  // Add missing keys
  if (addMissing) {
    console.log('\n📝 Adding missing keys...');
    for (const key of allUsedKeys) {
      // Check if key exists (exact match or as a namespace)
      const keyExists = flatTranslations[key] !== undefined || 
                       Object.keys(flatTranslations).some(existingKey => 
                         existingKey.startsWith(key + '.')
                       );
      
      if (!keyExists) {
        // Generate a placeholder value
        flatTranslations[key] = generateTranslationValue(key);
        results.addedKeys.push(key);
      }
    }
    console.log(`✅ Added ${results.addedKeys.length} missing keys`);
  }
  
  // Convert back to nested structure
  const newTranslations = unflattenObject(flatTranslations);
  
  // Sort keys alphabetically for better organization
  const sortedTranslations = sortObjectKeys(newTranslations);
  
  // Write back to file
  fs.writeFileSync(
    TRANSLATION_FILE,
    JSON.stringify(sortedTranslations, null, 2) + '\n',
    'utf-8'
  );
  
  results.finalKeyCount = Object.keys(flatTranslations).length;
  
  return results;
}

function sortObjectKeys(obj: any): any {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return obj;
  }
  
  const sorted: any = {};
  const keys = Object.keys(obj).sort();
  
  for (const key of keys) {
    sorted[key] = sortObjectKeys(obj[key]);
  }
  
  return sorted;
}

// Main execution
console.log('🔧 Starting translation fixes...\n');

// Check for flags
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyRemove = args.includes('--only-remove');
const onlyAdd = args.includes('--only-add');

if (dryRun) {
  console.log('🔍 DRY RUN MODE - No changes will be made\n');
}

fixTranslations(!onlyAdd, !onlyRemove).then(results => {
  console.log('\n📊 Summary:');
  console.log(`  Original keys: ${results.originalKeyCount}`);
  console.log(`  Removed keys: ${results.removedKeys.length}`);
  console.log(`  Added keys: ${results.addedKeys.length}`);
  console.log(`  Final keys: ${results.finalKeyCount}`);
  console.log(`  Net change: ${results.finalKeyCount - results.originalKeyCount > 0 ? '+' : ''}${results.finalKeyCount - results.originalKeyCount}`);
  
  if (results.addedKeys.length > 0) {
    console.log('\n✨ Added keys (review and update values as needed):');
    results.addedKeys.slice(0, 10).forEach(key => {
      console.log(`  - ${key}`);
    });
    if (results.addedKeys.length > 10) {
      console.log(`  ... and ${results.addedKeys.length - 10} more`);
    }
  }
  
  console.log('\n✅ Translation file has been updated!');
  console.log(`📦 Backup saved to: ${path.relative(process.cwd(), BACKUP_FILE)}`);
  console.log('\n💡 To restore from backup:');
  console.log(`   cp ${path.relative(process.cwd(), BACKUP_FILE)} ${path.relative(process.cwd(), TRANSLATION_FILE)}`);
}).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
