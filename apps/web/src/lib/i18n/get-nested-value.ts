/**
 * Recursive type for nested translation objects
 * Leaf values are strings, non-leaf values are nested objects
 */
export type TranslationObject = {
  [key: string]: string | TranslationObject;
};

/**
 * Type guard for checking if value is a nested translation object
 */
function isTranslationObject(value: unknown): value is TranslationObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Get a nested value from an object using dot notation
 */
export function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (!isTranslationObject(current)) {
      return undefined;
    }
    current = current[key];
  }

  return typeof current === 'string' ? current : undefined;
}
