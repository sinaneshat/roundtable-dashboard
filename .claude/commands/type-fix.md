---
description: Fix TypeScript type safety violations
argument-hint: [file-or-directory]
---

# TypeScript Fix Command

Target: $ARGUMENTS (or entire codebase if not specified)

## Find and fix these violations:

### CRITICAL (must fix):
1. `any` usage - replace with proper types
2. `unknown` without narrowing - add type guards
3. `Record<string, unknown>` - use discriminated unions
4. `as Type` casts - use Zod validation or type guards
5. `// @ts-ignore` - remove and fix underlying issue
6. `// @ts-expect-error` - remove and fix underlying issue

### Pattern violations:
1. Inline type definitions - extract to schema
2. Manual interfaces - derive from Zod with `z.infer`
3. Duplicate type definitions - consolidate to single source
4. Missing `.openapi()` on API schemas

## Fix strategy:

1. Run `bun run check-types` to get error list
2. Search for forbidden patterns:
   - `grep -r "as any" --include="*.ts" --include="*.tsx"`
   - `grep -r ": any" --include="*.ts" --include="*.tsx"`
   - `grep -r "unknown>" --include="*.ts" --include="*.tsx"`
   - `grep -r "ts-ignore" --include="*.ts" --include="*.tsx"`
3. For each violation:
   - Find the source schema/type it should derive from
   - Apply `z.infer<typeof Schema>` pattern
   - Use discriminated unions for variants
4. Run `bun run check-types` again to verify

## Reference patterns:
- Type inference chain: `/docs/type-inference-patterns.md`
- Zod schemas: `/src/api/core/schemas.ts`
- Enum patterns: `/src/api/core/enums.ts`
