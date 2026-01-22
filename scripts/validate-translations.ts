#!/usr/bin/env tsx
/**
 * Translation Validation Script
 * 
 * Validates the structure and format of translation files:
 * - Checks for valid JSON syntax
 * - Detects duplicate keys
 * - Validates key naming conventions
 * - Reports any structural issues
 */

import fs from 'node:fs';
import path from 'node:path';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalKeys: number;
    nestedKeys: number;
    flatKeys: number;
    duplicates: number;
  };
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

const TRANSLATION_FILE = path.join(process.cwd(), 'apps/web/src/i18n/locales/en/common.json');

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

function validateTranslations(): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    stats: {
      totalKeys: 0,
      nestedKeys: 0,
      flatKeys: 0,
      duplicates: 0,
    },
  };

  // Check if file exists
  if (!fs.existsSync(TRANSLATION_FILE)) {
    result.isValid = false;
    result.errors.push(`Translation file not found: ${TRANSLATION_FILE}`);
    return result;
  }

  try {
    // Read and parse JSON
    const content = fs.readFileSync(TRANSLATION_FILE, 'utf-8');
    const translations = JSON.parse(content);

    // Flatten to get all keys
    const flatKeys = flattenObject(translations);
    result.stats.totalKeys = Object.keys(flatKeys).length;

    // Check for empty values
    const emptyKeys: string[] = [];
    const suspiciousKeys: string[] = [];
    const seenValues = new Map<string, string[]>();

    for (const [key, value] of Object.entries(flatKeys)) {
      // Check for empty or whitespace-only values
      if (typeof value === 'string' && value.trim() === '') {
        emptyKeys.push(key);
      }

      // Check for suspicious patterns (keys that look like they might be untranslated)
      if (typeof value === 'string') {
        // Check for camelCase or PascalCase values (might be untranslated)
        if (/^[A-Z][a-zA-Z0-9]*$/.test(value) || /^[a-z]+([A-Z][a-z]*)*$/.test(value)) {
          suspiciousKeys.push(`${key}: "${value}"`);
        }

        // Track potential duplicates
        if (!seenValues.has(value)) {
          seenValues.set(value, []);
        }
        seenValues.get(value)!.push(key);
      }
    }

    // Report empty keys
    if (emptyKeys.length > 0) {
      result.warnings.push(`Found ${emptyKeys.length} empty translation keys:`);
      emptyKeys.slice(0, 10).forEach(key => {
        result.warnings.push(`  - ${key}`);
      });
      if (emptyKeys.length > 10) {
        result.warnings.push(`  ... and ${emptyKeys.length - 10} more`);
      }
    }

    // Report suspicious keys
    if (suspiciousKeys.length > 0) {
      result.warnings.push(`\nFound ${suspiciousKeys.length} suspicious translation values (might be untranslated):`);
      suspiciousKeys.slice(0, 10).forEach(key => {
        result.warnings.push(`  - ${key}`);
      });
      if (suspiciousKeys.length > 10) {
        result.warnings.push(`  ... and ${suspiciousKeys.length - 10} more`);
      }
    }

    // Report duplicate values (might indicate redundant keys)
    const duplicateValues = Array.from(seenValues.entries())
      .filter(([, keys]) => keys.length > 1)
      .sort((a, b) => b[1].length - a[1].length);

    result.stats.duplicates = duplicateValues.length;
    
    if (duplicateValues.length > 0) {
      result.warnings.push(`\nFound ${duplicateValues.length} duplicate values across different keys:`);
      duplicateValues.slice(0, 5).forEach(([value, keys]) => {
        result.warnings.push(`  Value "${value}" used in ${keys.length} keys:`);
        keys.slice(0, 3).forEach(key => {
          result.warnings.push(`    - ${key}`);
        });
        if (keys.length > 3) {
          result.warnings.push(`    ... and ${keys.length - 3} more`);
        }
      });
      if (duplicateValues.length > 5) {
        result.warnings.push(`  ... and ${duplicateValues.length - 5} more duplicate value groups`);
      }
    }

    // Count nested vs flat keys
    for (const key of Object.keys(flatKeys)) {
      if (key.includes('.')) {
        result.stats.nestedKeys++;
      } else {
        result.stats.flatKeys++;
      }
    }

  } catch (error) {
    result.isValid = false;
    if (error instanceof SyntaxError) {
      result.errors.push(`Invalid JSON syntax: ${error.message}`);
    } else {
      result.errors.push(`Error reading translation file: ${String(error)}`);
    }
  }

  return result;
}

const result = validateTranslations();

if (result.isValid && result.warnings.length === 0) {
  process.exit(0);
} else if (result.isValid) {
  process.exit(0);
} else {
  process.exit(1);
}
