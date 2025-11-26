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

function flattenObject(obj: JsonObject, prefix = ''): string[] {
  const result: string[] = [];

  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (isJsonObject(value)) {
      result.push(...flattenObject(value, fullKey));
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
  const translationContent = fs.readFileSync(TRANSLATION_FILE, 'utf-8');
  const translations = JSON.parse(translationContent);

  const allKeys = flattenObject(translations);

  const sourceFiles = await getAllSourceFiles();
  
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

findUnusedKeys().catch(error => {
  process.exit(1);
});
