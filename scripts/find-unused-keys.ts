#!/usr/bin/env tsx
import { glob } from 'glob';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const TRANSLATION_FILE = path.join(process.cwd(), 'src/i18n/locales/en/common.json');
const SOURCE_DIRS = ['src/components', 'src/app', 'src/containers', 'src/lib'];

const UnusedKeysResultSchema = z.object({
  totalKeys: z.number().int().nonnegative(),
  usedKeys: z.number().int().nonnegative(),
  unusedKeys: z.array(z.string()),
  usageCount: z.record(z.string(), z.number().int().nonnegative()),
});

type UnusedKeysResult = z.infer<typeof UnusedKeysResultSchema>;

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.record(z.string(), JsonValueSchema),
    z.array(JsonValueSchema),
  ]),
);

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = Record<string, JsonValue>;

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
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const directPattern = new RegExp(`t\\(['"\`]${escapedKey}['"\`][),]`, 'g');
  if (directPattern.test(content)) return true;

  const templatePattern = new RegExp(`['"\`]${escapedKey}['"\`]`, 'g');
  if (templatePattern.test(content)) return true;

  const namespacePattern = new RegExp(`useTranslations\\(['"\`]${escapedKey}['"\`]\\)`, 'g');
  if (namespacePattern.test(content)) return true;

  return false;
}

async function findUnusedKeys(): Promise<UnusedKeysResult> {
  const translationContent = fs.readFileSync(TRANSLATION_FILE, 'utf-8');
  const translations = JSON.parse(translationContent);

  const allKeys = flattenObject(translations);

  const sourceFiles = await getAllSourceFiles();

  const usageCount: Record<string, number> = {};
  allKeys.forEach(key => usageCount[key] = 0);

  for (const file of sourceFiles) {
    const filePath = path.join(process.cwd(), file);
    const content = fs.readFileSync(filePath, 'utf-8');

    for (const key of allKeys) {
      if (findKeyUsageInContent(content, key)) {
        usageCount[key]++;
      }
    }
  }

  const unusedKeys = allKeys.filter(key => usageCount[key] === 0);

  return {
    totalKeys: allKeys.length,
    usedKeys: allKeys.length - unusedKeys.length,
    unusedKeys,
    usageCount,
  };
}

async function main() {
  console.log('Analyzing translation key usage...\n');

  const result = await findUnusedKeys();

  console.log(`Total Keys: ${result.totalKeys}`);
  console.log(`Used Keys: ${result.usedKeys}`);
  console.log(`Unused Keys: ${result.unusedKeys.length}\n`);

  if (result.unusedKeys.length > 0) {
    console.log('Unused Translation Keys:');
    console.log('========================\n');
    result.unusedKeys.forEach(key => {
      console.log(`  - ${key}`);
    });
  } else {
    console.log('All translation keys are being used!');
  }

  const usageRate = ((result.usedKeys / result.totalKeys) * 100).toFixed(1);
  console.log(`\nUsage Rate: ${usageRate}%`);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
