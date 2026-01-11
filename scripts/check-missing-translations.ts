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

function flattenObject(obj: JsonObject, prefix = ''): Set<string> {
  const result = new Set<string>();

  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (isJsonObject(value)) {
      flattenObject(value, fullKey).forEach(k => result.add(k));
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
  const translationContent = fs.readFileSync(TRANSLATION_FILE, 'utf-8');
  const translations = JSON.parse(translationContent);

  const existingKeys = flattenObject(translations);

  const sourceFiles = await getAllSourceFiles();
  
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

checkMissingTranslations().catch(error => {
  process.exit(1);
});
