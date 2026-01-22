#!/usr/bin/env tsx
/**
 * Add Missing i18n Keys Script
 *
 * Finds missing translation keys and adds them to common.json with
 * sensible default values.
 *
 * Handles both client components (useTranslations) and server components (getTranslations).
 */

import { glob } from 'glob';
import fs from 'node:fs';
import path from 'node:path';

const TRANSLATION_FILE = path.join(process.cwd(), 'apps/web/src/i18n/locales/en/common.json');
const SOURCE_DIRS = ['apps/web/src/components', 'apps/web/src/routes', 'apps/web/src/containers'];

interface NamespaceInfo {
  varName: string;
  namespace: string;
}

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

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
      result.add(fullKey);
    } else {
      result.add(fullKey);
    }
  }
  return result;
}

function isValidTranslationKey(key: string): boolean {
  const invalidPatterns = [
    /^[@\/]/,
    /^node:/,
    /^\s*$/,
    /^[\\n\\t\s]+$/,
    /^[<>]/,
    /^https?:/,
    /^[.;=,_\-/]+$/,
    /^\d+$/,
    /^[A-Z][a-z]+ [A-Z]/,
    /^[€$£]\d/,
    /\s{2,}/,
    /^Content-Type$/i,
    /^transfer-encoding$/i,
    /^content-type$/i,
    /^x-request-id$/i,
    /^cf-ray$/i,
    /^cookie$/i,
    /^2d$/,
    /^canvas$/,
    /^shiki$/,
    /^toast$/,
    /^button$/,
    /^error$/,
    /^failed$/,
    /^message$/,
    /\.tsx?$/,
    /\.jsx?$/,
  ];

  for (const pattern of invalidPatterns) {
    if (pattern.test(key)) return false;
  }

  const validKeyPattern = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)*$/;
  return validKeyPattern.test(key);
}

async function getAllSourceFiles(): Promise<string[]> {
  const patterns = SOURCE_DIRS.map(dir => `${dir}/**/*.{ts,tsx}`);
  const files: string[] = [];

  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: process.cwd(),
      ignore: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/__tests__/**', '**/*.test.*']
    });
    files.push(...matches);
  }

  return files;
}

function extractNamespacesFromFile(content: string): NamespaceInfo[] {
  const namespaces: NamespaceInfo[] = [];

  const patterns = [
    /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(['"]([^'"]+)['"]\)/g,
    /(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(['"]([^'"]+)['"]\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      namespaces.push({
        varName: match[1],
        namespace: match[2],
      });
    }
  }

  return namespaces;
}

function extractTranslationKeysFromFile(content: string): string[] {
  const keys: string[] = [];

  const hasTranslations = /(?:useTranslations|getTranslations)\(/.test(content);
  if (!hasTranslations) return keys;

  const namespaceInfos = extractNamespacesFromFile(content);
  if (namespaceInfos.length === 0) return keys;

  const varToNamespace = new Map<string, string>();
  for (const info of namespaceInfos) {
    varToNamespace.set(info.varName, info.namespace);
  }

  const lines = content.split('\n');

  for (const line of lines) {
    const callPatterns = [
      /\b(\w+)\(['"]([^'"]+)['"]/g,
      /\b(\w+)\.raw\(['"]([^'"]+)['"]/g,
    ];

    for (const pattern of callPatterns) {
      let match;
      pattern.lastIndex = 0;

      while ((match = pattern.exec(line)) !== null) {
        const varName = match[1];
        const keyPart = match[2];

        const namespace = varToNamespace.get(varName);
        if (!namespace) continue;

        const fullKey = `${namespace}.${keyPart}`;

        if (isValidTranslationKey(fullKey)) {
          keys.push(fullKey);
        }
      }
    }
  }

  return keys;
}

// Better value generation based on key semantics
function generateTranslationValue(key: string): string {
  const parts = key.split('.');
  const lastPart = parts[parts.length - 1];

  // Special case mappings for common patterns
  const specialCases: Record<string, string> = {
    'delete': 'Delete',
    'cancel': 'Cancel',
    'save': 'Save',
    'update': 'Update',
    'done': 'Done',
    'copy': 'Copy',
    'share': 'Share',
    'rename': 'Rename',
    'pin': 'Pin',
    'unpin': 'Unpin',
    'upgrade': 'Upgrade',
    'submit': 'Submit',
    'back': 'Back',
    'download': 'Download',
    'title': 'Title',
    'subtitle': 'Subtitle',
    'description': 'Description',
    'label': 'Label',
    'like': 'Like',
    'dislike': 'Dislike',
    'recording': 'Recording...',
    'analyzing': 'Analyzing...',
    'searching': 'Searching...',
    'loading': 'Loading...',
    'sources': 'Sources',
    'source': 'Source',
    'relevance': 'Relevance',
    'words': 'words',
    'model': 'Model',
    'status': 'Status',
    'errorTitle': 'Error',
    'errorType': 'Error Type',
    'apiError': 'API Error',
    'networkError': 'Network Error',
    'unexpectedError': 'An unexpected error occurred',
    'validationError': 'Validation Error',
    'authenticationError': 'Authentication Error',
    'streamFailed': 'Stream failed',
    'unknownError': 'An unknown error occurred',
    'scrollToBottom': 'Scroll to bottom',
    'moreOptions': 'More options',
    'searchPlaceholder': 'Search...',
    'tryFree': 'Try Free',
    'count': '{count}',
  };

  if (specialCases[lastPart]) {
    return specialCases[lastPart];
  }

  return lastPart
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

function setNestedValue(obj: JsonObject, key: string, value: JsonValue): void {
  const parts = key.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || !isJsonObject(current[parts[i]])) {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as JsonObject;
  }

  current[parts[parts.length - 1]] = value;
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

async function main() {
  console.log('🔧 Adding missing translation keys...\n');

  const translationContent = fs.readFileSync(TRANSLATION_FILE, 'utf-8');
  const translations: JsonObject = JSON.parse(translationContent);
  const existingKeys = flattenObject(translations);

  console.log(`📚 Existing keys: ${existingKeys.size}\n`);

  const sourceFiles = await getAllSourceFiles();
  const usedKeys = new Set<string>();

  for (const file of sourceFiles) {
    const filePath = path.join(process.cwd(), file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const keys = extractTranslationKeysFromFile(content);
    keys.forEach(k => usedKeys.add(k));
  }

  console.log(`🔍 Keys used in code: ${usedKeys.size}\n`);

  const missingKeys: string[] = [];

  for (const key of usedKeys) {
    const keyExists = existingKeys.has(key) ||
      Array.from(existingKeys).some(existing => existing.startsWith(key + '.'));

    if (!keyExists) {
      missingKeys.push(key);
    }
  }

  if (missingKeys.length === 0) {
    console.log('✅ No missing keys found!');
    return;
  }

  console.log(`❌ Missing keys: ${missingKeys.length}\n`);
  console.log('Adding missing keys:\n');

  for (const key of missingKeys.sort()) {
    const value = generateTranslationValue(key);
    setNestedValue(translations, key, value);
    console.log(`  + ${key}: "${value}"`);
  }

  const sorted = sortObjectKeys(translations) as JsonObject;
  fs.writeFileSync(
    TRANSLATION_FILE,
    JSON.stringify(sorted, null, 2) + '\n',
    'utf-8'
  );

  console.log(`\n✅ Added ${missingKeys.length} keys to common.json`);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
