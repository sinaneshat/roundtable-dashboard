---
description: Refactor for code reduction and single source of truth
argument-hint: [file-or-pattern]
---

# Refactor Command

Target: $ARGUMENTS

## Goals:
1. Reduce code duplication
2. Establish single source of truth
3. Consolidate barrel exports
4. Remove dead/legacy code

## Checklist:

### 1. Duplicate Detection
- Find similar functions across files
- Identify copy-pasted logic blocks
- Look for repeated type definitions
- Check for redundant validation

### 2. Consolidation Targets
- Multiple files exporting same thing differently
- Re-exports with different names
- Scattered utility functions
- Repeated error handling patterns

### 3. Barrel Export Audit
Each domain should have ONE barrel export:
```typescript
// src/api/core/index.ts - ONLY place to import from
export * from './schemas';
export * from './enums';
export * from './handlers';
```

Fix violations:
- Direct imports bypassing barrel
- Multiple barrels for same domain
- Circular dependencies from re-exports

### 4. Dead Code Removal
Delete without hesitation:
- Unused exports (grep for usage)
- Commented code blocks
- `_legacy` or `_old` prefixed items
- Backwards-compat shims
- `// TODO: remove` markers

### 5. Pattern Extraction
When 3+ occurrences of same pattern:
1. Extract to shared utility
2. Update all call sites
3. Add to appropriate barrel export

## Execution:
1. Analyze target for duplication
2. Identify consolidation opportunities
3. Create/update shared utilities
4. Update imports to use barrel exports
5. Remove dead code
6. Verify with `pnpm lint && pnpm check-types`
