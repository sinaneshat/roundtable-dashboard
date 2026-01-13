#!/usr/bin/env tsx
/**
 * Find Missing i18n Keys Script
 *
 * Scans the codebase for translation key usages via t() and useTranslations()/getTranslations()
 * and finds keys that are used but not defined in common.json.
 *
 * Handles both client components (useTranslations) and server components (getTranslations).
 */

import { glob } from 'glob';
import fs from 'node:fs';
import path from 'node:path';

const TRANSLATION_FILE = path.join(process.cwd(), 'src/i18n/locales/en/common.json');
const SOURCE_DIRS = ['src/components', 'src/app', 'src/containers'];

interface KeyUsage {
  key: string;
  file: string;
  line: number;
  context: string;
}

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
      result.add(fullKey); // Add namespace too
    } else {
      result.add(fullKey);
    }
  }
  return result;
}

function isValidTranslationKey(key: string): boolean {
  // Skip obvious false positives
  const invalidPatterns = [
    /^[@\/]/, // imports like @/components or ./file
    /^node:/, // node imports
    /^\s*$/, // empty or whitespace
    /^[\\n\\t\s]+$/, // escape sequences
    /^[<>]/, // JSX
    /^https?:/, // URLs
    /^[.;=,_\-/]+$/, // Single punctuation
    /^\d+$/, // Pure numbers
    /^[A-Z][a-z]+ [A-Z]/, // English sentences like "Pro Plan"
    /^[€$£]\d/, // Currency
    /\s{2,}/, // Multiple spaces
    /^Content-Type$/i,
    /^transfer-encoding$/i,
    /^content-type$/i,
    /^x-request-id$/i,
    /^cf-ray$/i,
    /^cookie$/i,
    /^2d$/, // canvas context
    /^canvas$/,
    /^shiki$/,
    /^toast$/,
    /^button$/,
    /^error$/,
    /^failed$/,
    /^message$/,
    /\.tsx?$/, // file extensions
    /\.jsx?$/,
  ];

  for (const pattern of invalidPatterns) {
    if (pattern.test(key)) return false;
  }

  // Must look like a translation key (lowercase words with dots)
  // Valid patterns: chat.input.placeholder, actions.save, meta.signIn.title, etc.
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

  // Match: const t = useTranslations('namespace')
  // Match: const t = await getTranslations('namespace')
  // Match: const tSeo = await getTranslations('seo.keywords')
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

function extractTranslationKeysFromFile(content: string, filePath: string): KeyUsage[] {
  const usages: KeyUsage[] = [];
  const lines = content.split('\n');

  // Check if file uses translations
  const hasTranslations = /(?:useTranslations|getTranslations)\(/.test(content);
  if (!hasTranslations) return usages;

  // Find all namespaces with their variable names
  const namespaceInfos = extractNamespacesFromFile(content);

  if (namespaceInfos.length === 0) return usages;

  // Build a map of variable name to namespace
  const varToNamespace = new Map<string, string>();
  for (const info of namespaceInfos) {
    varToNamespace.set(info.varName, info.namespace);
  }

  // Find all translation calls: t('key'), t.raw('key'), tSeo('key'), etc.
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // Match patterns like: t('key'), t("key"), t.raw('key'), tSeo('key')
    // Capture the variable name and the key
    const callPatterns = [
      /\b(\w+)\(['"]([^'"]+)['"]/g,        // t('key') or tSeo('key')
      /\b(\w+)\.raw\(['"]([^'"]+)['"]/g,   // t.raw('key')
    ];

    for (const pattern of callPatterns) {
      let match;
      pattern.lastIndex = 0;

      while ((match = pattern.exec(line)) !== null) {
        const varName = match[1];
        const keyPart = match[2];

        // Check if this variable is a translation function
        const namespace = varToNamespace.get(varName);
        if (!namespace) continue;

        // Build the full key
        const fullKey = `${namespace}.${keyPart}`;

        if (isValidTranslationKey(fullKey)) {
          usages.push({
            key: fullKey,
            file: filePath,
            line: lineNum + 1,
            context: line.trim(),
          });
        }
      }
    }
  }

  return usages;
}

function generateTranslationValue(key: string): string {
  const parts = key.split('.');
  const lastPart = parts[parts.length - 1];

  // Convert camelCase to Title Case
  return lastPart
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

function groupKeysByNamespace(keys: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const key of keys) {
    const parts = key.split('.');
    const namespace = parts.slice(0, -1).join('.');

    if (!grouped.has(namespace)) {
      grouped.set(namespace, []);
    }
    grouped.get(namespace)!.push(key);
  }

  return grouped;
}

async function main() {
  console.log('🔍 Finding missing translation keys...\n');

  const translationContent = fs.readFileSync(TRANSLATION_FILE, 'utf-8');
  const translations = JSON.parse(translationContent);
  const existingKeys = flattenObject(translations);

  console.log(`📚 Found ${existingKeys.size} existing translation keys\n`);

  const sourceFiles = await getAllSourceFiles();
  console.log(`📁 Scanning ${sourceFiles.length} source files...\n`);

  const allUsages: KeyUsage[] = [];

  for (const file of sourceFiles) {
    const filePath = path.join(process.cwd(), file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const usages = extractTranslationKeysFromFile(content, file);
    allUsages.push(...usages);
  }

  // Find unique missing keys
  const usedKeys = new Set(allUsages.map(u => u.key));
  const missingKeys: string[] = [];

  for (const key of usedKeys) {
    // Check if key exists exactly or as a namespace
    const keyExists = existingKeys.has(key) ||
      Array.from(existingKeys).some(existing => existing.startsWith(key + '.'));

    if (!keyExists) {
      missingKeys.push(key);
    }
  }

  // Sort and display results
  missingKeys.sort();

  console.log(`\n📊 Results:`);
  console.log(`   Total keys used: ${usedKeys.size}`);
  console.log(`   Missing keys: ${missingKeys.length}`);

  if (missingKeys.length === 0) {
    console.log('\n✅ All translation keys are defined!');
    return;
  }

  console.log('\n❌ Missing Translation Keys:\n');

  const grouped = groupKeysByNamespace(missingKeys);

  for (const [namespace, keys] of grouped) {
    console.log(`  📁 ${namespace || '(root)'}:`);
    for (const key of keys) {
      const shortKey = namespace ? key.slice(namespace.length + 1) : key;
      // Find usage location
      const usage = allUsages.find(u => u.key === key);
      console.log(`     - ${shortKey}`);
      if (usage) {
        console.log(`       └─ ${usage.file}:${usage.line}`);
      }
    }
    console.log('');
  }

  // Generate JSON to add
  console.log('\n📝 JSON to add to common.json:\n');
  console.log('```json');

  const toAdd: JsonObject = {};
  for (const key of missingKeys) {
    const parts = key.split('.');
    let current = toAdd;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) {
        current[parts[i]] = {};
      }
      current = current[parts[i]] as JsonObject;
    }

    current[parts[parts.length - 1]] = generateTranslationValue(key);
  }

  console.log(JSON.stringify(toAdd, null, 2));
  console.log('```');

  // Output flat list for easy copying
  console.log('\n📋 Flat key list:\n');
  for (const key of missingKeys) {
    console.log(`"${key}": "${generateTranslationValue(key)}",`);
  }
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
