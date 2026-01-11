---
description: Apply enum 5-part pattern to string literals
argument-hint: <enum-name> <values...>
---

# Enum Pattern Application

Create or refactor enum: $ARGUMENTS

## 5-Part Pattern (MANDATORY):

```typescript
// ============================================================================
// [ENUM_NAME]
// ============================================================================

// 1. ARRAY CONSTANT - source of truth
export const [NAME]_VALUES = ['value1', 'value2', 'value3'] as const;

// 2. DEFAULT VALUE (if applicable)
export const DEFAULT_[NAME]: [Name] = 'value1';

// 3. ZOD SCHEMA - runtime validation + OpenAPI
export const [Name]Schema = z.enum([NAME]_VALUES).openapi({
  description: '[Description]',
  example: 'value1',
});

// 4. TYPESCRIPT TYPE - inferred from Zod
export type [Name] = z.infer<typeof [Name]Schema>;

// 5. CONSTANT OBJECT - for code usage
export const [Name]s = {
  VALUE1: 'value1' as const,
  VALUE2: 'value2' as const,
  VALUE3: 'value3' as const,
} as const;
```

## Steps:
1. Search codebase for hardcoded string literals matching this enum
2. Create enum in `/src/api/core/enums.ts` following 5-part pattern
3. Replace all hardcoded strings with constant object references
4. Update imports in affected files
5. Verify with `pnpm check-types`

## Usage after creation:
```typescript
// CORRECT
import { [Name]s } from '@/api/core/enums';
if (value === [Name]s.VALUE1) { ... }

// WRONG - hardcoded string
if (value === 'value1') { ... }
```
