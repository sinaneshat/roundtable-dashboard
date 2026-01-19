# Enum Conversion Opportunities - 5-Part Pattern

Found opportunities to apply 5-part enum pattern (Array → Default → Schema → Type → Constants)

## Priority 1: Active Code (Non-Test Files)

### 1. Request Logger - Log Level
**File**: `apps/api/src/middleware/request-logger.ts:23`
```typescript
// CURRENT - Inline type
type LogLevel = 'minimal' | 'standard' | 'verbose';
```

**Impact**: Used in environment-based logging configuration
**Recommendation**: Create enum in `packages/shared/src/enums/logging.ts`
```typescript
// 1️⃣ ARRAY CONSTANT
export const REQUEST_LOG_LEVELS = ['minimal', 'standard', 'verbose'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_REQUEST_LOG_LEVEL: RequestLogLevel = 'standard';

// 3️⃣ ZOD SCHEMA
export const RequestLogLevelSchema = z.enum(REQUEST_LOG_LEVELS).openapi({
  description: 'Request logging verbosity level',
  example: 'standard',
});

// 4️⃣ TYPESCRIPT TYPE
export type RequestLogLevel = z.infer<typeof RequestLogLevelSchema>;

// 5️⃣ CONSTANT OBJECT
export const RequestLogLevels = {
  MINIMAL: 'minimal' as const,
  STANDARD: 'standard' as const,
  VERBOSE: 'verbose' as const,
} as const;
```

---

### 2. Image Component - Placeholder Type
**File**: `apps/web/src/components/ui/image.tsx:29`
```typescript
// CURRENT - Inline type
placeholder?: 'blur' | 'empty';
```

**Impact**: Used for image loading UX
**Recommendation**: Create enum in `packages/shared/src/enums/ui.ts` (file already exists)
```typescript
// 1️⃣ ARRAY CONSTANT
export const IMAGE_PLACEHOLDER_TYPES = ['blur', 'empty'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_IMAGE_PLACEHOLDER_TYPE: ImagePlaceholderType = 'empty';

// 3️⃣ ZOD SCHEMA
export const ImagePlaceholderTypeSchema = z.enum(IMAGE_PLACEHOLDER_TYPES).openapi({
  description: 'Image placeholder display strategy during loading',
  example: 'blur',
});

// 4️⃣ TYPESCRIPT TYPE
export type ImagePlaceholderType = z.infer<typeof ImagePlaceholderTypeSchema>;

// 5️⃣ CONSTANT OBJECT
export const ImagePlaceholderTypes = {
  BLUR: 'blur' as const,
  EMPTY: 'empty' as const,
} as const;
```

---

### 3. Test Mocks - Invalid Metadata Type
**File**: `apps/web/src/lib/testing/typed-test-mocks.ts:424`
```typescript
// CURRENT - Inline type
export type InvalidMetadataType = 'null' | 'undefined' | 'empty' | 'missing-round';
```

**Impact**: Test helper for metadata validation testing
**Recommendation**: Keep in test file but add validation helper
```typescript
// 1️⃣ ARRAY CONSTANT
export const INVALID_METADATA_TYPES = ['null', 'undefined', 'empty', 'missing-round'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_INVALID_METADATA_TYPE: InvalidMetadataType = 'null';

// 3️⃣ ZOD SCHEMA (optional for tests)
export const InvalidMetadataTypeSchema = z.enum(INVALID_METADATA_TYPES);

// 4️⃣ TYPESCRIPT TYPE
export type InvalidMetadataType = z.infer<typeof InvalidMetadataTypeSchema>;

// 5️⃣ CONSTANT OBJECT
export const InvalidMetadataTypes = {
  NULL: 'null' as const,
  UNDEFINED: 'undefined' as const,
  EMPTY: 'empty' as const,
  MISSING_ROUND: 'missing-round' as const,
} as const;
```

---

## Priority 2: Repeated Test Patterns

### 4. Message/Stream Status (Multiple Test Files)
**Files**: 15+ test files with variations
```typescript
// CURRENT - Scattered across tests
type MessageStatus = 'pending' | 'streaming' | 'complete' | 'error';
type StreamStatus = 'active' | 'completed' | 'failed';
type ParticipantState = 'completed' | 'in-progress' | 'pending';
```

**Impact**: Test consistency, pattern recognition
**Recommendation**: Already exists in `packages/shared/src/enums/streaming.ts`
- `MessageStatus` → Use existing enum
- Tests should import from shared enums instead of defining inline

---

### 5. Timeline Event Types (Test Files)
**Files**: Multiple timeline test files
```typescript
// CURRENT - Inline in tests
type TimelineEventType = 'user-message' | 'pre-search' | 'participant-message' | 'moderator' | 'feedback';
type CallType = 'PATCH' | 'changelog' | 'pre-search-execute' | 'stream';
```

**Impact**: Timeline event tracking consistency
**Recommendation**: These are test-specific and can remain inline OR move to test utilities

---

## Implementation Strategy

### Phase 1: High-Value Production Code
1. **Request Logger (`LogLevel`)** - Used in middleware, affects observability
2. **Image Component (`ImagePlaceholderType`)** - UI component pattern

### Phase 2: Test Infrastructure
3. **Test Mocks (`InvalidMetadataType`)** - Improve test utilities
4. **Audit Test Files** - Replace inline types with existing enums from shared package

### Phase 3: Documentation & Migration
5. Update existing files to use new enums
6. Add ESLint rule (optional) to prevent inline string literal unions in production code

---

## Existing Enums to Reuse

Tests should import from existing enums instead of redefining:

- ✅ `MessageStatus` → `packages/shared/src/enums/streaming.ts`
- ✅ `StreamStatus` → `packages/shared/src/enums/ai-sdk.ts`
- ✅ `SubscriptionStatus` → `packages/shared/src/enums/billing.ts`
- ✅ `ErrorType` → `packages/shared/src/enums/errors.ts`
- ✅ `LogLevel` → `packages/shared/src/enums/logging.ts` (already has `LogLevel`, add `RequestLogLevel`)

---

## Files Needing Enum Imports

### Test Files Using Inline Message Status
These should import from `@roundtable/shared/enums`:
- `apps/web/src/stores/chat/__tests__/multi-round-streaming-lifecycle.test.ts:27`
- `apps/web/src/stores/chat/__tests__/ai-sdk-resume-integration.test.ts:23`
- `apps/web/src/stores/chat/__tests__/participant-streaming-sequence.test.ts:42`
- `apps/web/src/stores/chat/__tests__/e2e-conversation-flow-optimization.test.ts:98`
- `apps/web/src/stores/chat/__tests__/conversation-round-e2e-ordering.test.ts:78`
- And 10+ more...

### Test Files Using Inline Stream Status
These should import from `@roundtable/shared/enums`:
- `apps/web/src/stores/chat/__tests__/stream-resume-recovery-playwright.test.ts:18`
- `apps/web/src/stores/chat/__tests__/ai-sdk-resume-integration.test.ts:22`
- `apps/web/src/stores/chat/__tests__/mid-stream-refresh-p0-loss.test.ts:653`
- `apps/web/src/stores/chat/__tests__/kv-pubsub-resumable-streams.test.ts:52`

---

## Enum Pattern Compliance Checklist

When creating new enums:
- [ ] **Part 1**: Array constant with `as const` assertion
- [ ] **Part 2**: Default value with explicit type annotation
- [ ] **Part 3**: Zod schema with `.openapi()` metadata
- [ ] **Part 4**: TypeScript type from `z.infer<>`
- [ ] **Part 5**: Constant object for code usage (prevents typos)
- [ ] Add validation helper if needed (`isValid*`, `parse*`)
- [ ] Add UI labels object if needed (`*_LABELS`)
- [ ] Export from appropriate domain enum file
- [ ] Re-export from `packages/shared/src/enums/index.ts`

---

## Next Steps

1. **Create New Enums**:
   - Add `RequestLogLevel` to `packages/shared/src/enums/logging.ts`
   - Add `ImagePlaceholderType` to `packages/shared/src/enums/ui.ts`
   - Add `InvalidMetadataType` validation to `apps/web/src/lib/testing/typed-test-mocks.ts`

2. **Update Import Statements**:
   - Replace inline types in middleware
   - Replace inline types in components
   - Update test files to use shared enums

3. **Verify Pattern Compliance**:
   - Run `pnpm check-types` to verify no type errors
   - Run `pnpm lint` to verify code style
   - Search for remaining `type X = 'a' | 'b'` patterns

4. **Document Patterns**:
   - Update `docs/type-inference-patterns.md` with new enums
   - Add examples to enum files showing usage patterns
