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

/**
 * Type-safe JSON value representation for translation files.
 * Follows the established pattern of explicit typing over `any`.
 */
type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

/** Type guard to check if a JSON value is a JsonObject (nested object) */
function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flattenObject(obj: JsonObject, prefix = ''): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};

  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (isJsonObject(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

function unflattenObject(flatObj: Record<string, JsonValue>): JsonObject {
  const result: JsonObject = {};

  for (const [key, value] of Object.entries(flatObj)) {
    const parts = key.split('.');
    let current: JsonObject = result;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part]) {
        current[part] = {};
      }
      // We know this is a JsonObject because we just created it
      current = current[part] as JsonObject;
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
  const originalContent = fs.readFileSync(TRANSLATION_FILE, 'utf-8');
  fs.writeFileSync(BACKUP_FILE, originalContent, 'utf-8');

  const translations = JSON.parse(originalContent);
  const flatTranslations = flattenObject(translations);
  const originalKeyCount = Object.keys(flatTranslations).length;

  const sourceFiles = await getAllSourceFiles();
  
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
  
  if (removeUnused) {
    for (const key of Object.keys(flatTranslations)) {
      if (!usedKeys.has(key)) {
        const isNamespace = Array.from(usedKeys).some(usedKey =>
          usedKey.startsWith(key + '.')
        );

        if (!isNamespace) {
          delete flatTranslations[key];
          results.removedKeys.push(key);
        }
      }
    }
  }

  if (addMissing) {
    for (const key of allUsedKeys) {
      const keyExists = flatTranslations[key] !== undefined ||
                       Object.keys(flatTranslations).some(existingKey =>
                         existingKey.startsWith(key + '.')
                       );

      if (!keyExists) {
        flatTranslations[key] = generateTranslationValue(key);
        results.addedKeys.push(key);
      }
    }
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

function sortObjectKeys(obj: JsonValue): JsonValue {
  if (!isJsonObject(obj)) {
    return obj;
  }

  const sorted: JsonObject = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    sorted[key] = sortObjectKeys(obj[key]);
  }

  return sorted;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const onlyRemove = args.includes('--only-remove');
const onlyAdd = args.includes('--only-add');

fixTranslations(!onlyAdd, !onlyRemove).catch(error => {
  process.exit(1);
});
