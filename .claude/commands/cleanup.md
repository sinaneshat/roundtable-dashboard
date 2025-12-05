---
description: Fix TypeScript, ESLint, and code quality issues
argument-hint: [scope]
---

# Cleanup Command

Ask the user which cleanup tasks they want to run. Present these options:

1. **TypeScript Violations** - Fix type safety issues
2. **ESLint Errors** - Fix linting violations
3. **Test Failures** - Fix and update failing tests
4. **Enum Patterns** - Apply enum-based patterns for reusability
5. **Dead Code** - Remove legacy/backwards-compatible/duplicate code
6. **Anti-Patterns** - Fix anti-patterns by comparing to sibling files
7. **Full Cleanup** - Run all of the above

If user provided scope argument: $ARGUMENTS

## TypeScript Violations Checklist

When fixing TypeScript issues, enforce these rules ruthlessly:

**FORBIDDEN PATTERNS (fix immediately):**
- `any` type usage
- `unknown` type without proper narrowing
- `Record<string, unknown>` - use discriminated unions instead
- Force typecasting with `as Type`
- Inline type extensions `{ ...existingType, newField: string }`
- Hardcoded interfaces not built from existing types
- `// @ts-ignore` or `// @ts-expect-error`
- `// eslint-disable` comments

**REQUIRED PATTERNS:**
- Infer types from Zod schemas: `z.infer<typeof Schema>`
- Use discriminated unions for variant types
- Extend existing types: `BaseSchema.extend({...})`
- Use type guards for narrowing
- Follow enum 5-part pattern from `/docs/type-inference-patterns.md`

## Enum Pattern Application

Apply the 5-part enum pattern to all string literal unions:

```typescript
// 1. ARRAY CONSTANT
export const STATUS_VALUES = ['pending', 'active', 'complete'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_STATUS: Status = 'pending';

// 3. ZOD SCHEMA
export const StatusSchema = z.enum(STATUS_VALUES);

// 4. TYPESCRIPT TYPE
export type Status = z.infer<typeof StatusSchema>;

// 5. CONSTANT OBJECT
export const Statuses = {
  PENDING: 'pending' as const,
  ACTIVE: 'active' as const,
  COMPLETE: 'complete' as const,
} as const;
```

## Dead Code Removal

Remove without hesitation:
- Unused imports/exports
- Commented-out code
- TODO comments for completed work
- Backwards-compatible shims (`_oldVar` renames)
- Re-exports from multiple locations (consolidate to barrel)
- `// removed` or `// deprecated` markers

## Test Fixing Strategy

When fixing tests:
1. Match exact UI behavior and store interactions
2. Follow same order as real user flows
3. Mock at API boundaries, not internal functions
4. Use `@/lib/testing` utilities
5. Prefer `getByRole`, `getByLabelText` over test IDs

## Anti-Pattern Detection

Compare each file to its siblings and fix:
- Inconsistent naming conventions
- Different patterns for same operations
- Duplicated logic that should be shared
- Missing error handling present in siblings
- Different import styles

## Execution

After user selects options:
1. Run `pnpm lint` to identify ESLint issues
2. Run `pnpm check-types` to identify TypeScript issues
3. Search for forbidden patterns in affected files
4. Fix issues following established patterns in `/docs/type-inference-patterns.md`
5. Run `pnpm test` to verify fixes don't break tests
6. Report summary of changes made
