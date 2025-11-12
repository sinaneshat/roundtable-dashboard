# Type Guards Reference Guide

Quick reference for using type guards in the Roundtable codebase.

## Import

```typescript
import {
  isObject,
  isNonEmptyString,
  isTextPart,
  isToolCall,
  safeParse,
  createZodGuard
} from '@/lib/utils/type-guards';
```

## Common Patterns

### 1. Validating AI SDK Message Parts

```typescript
// ❌ OLD WAY (unsafe)
const textParts = message.parts?.filter(p => p.type === 'text') as Array<{type: 'text'; text: string}>;

// ✅ NEW WAY (type-safe)
const textParts = message.parts?.filter(isTextPart) ?? [];
// textParts is automatically typed as Array<{type: 'text'; text: string}>
```

### 2. Validating Tool Calls

```typescript
// ❌ OLD WAY (unsafe)
const toolCalls = (Array.isArray(result.toolCalls) ? result.toolCalls : []) as Array<{toolName: string; input: unknown}>;

// ✅ NEW WAY (type-safe)
const rawToolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
const toolCalls = rawToolCalls.filter(isToolCall);
```

### 3. Validating with Zod Schemas

```typescript
import { StripeSubscriptionStatusSchema } from '@/api/core/enums';

// ❌ OLD WAY (unsafe)
const status = subscription.status as StripeSubscriptionStatus;

// ✅ NEW WAY (type-safe)
const validatedStatus = safeParse(StripeSubscriptionStatusSchema, subscription.status);
if (!validatedStatus) {
  throw new Error(`Invalid subscription status: ${subscription.status}`);
}
// validatedStatus is now StripeSubscriptionStatus
```

### 4. Checking Object Properties

```typescript
// ❌ OLD WAY (unsafe)
const httpError = error as Error & { statusCode?: number };
const code = httpError.statusCode;

// ✅ NEW WAY (type-safe)
const code = isObject(error) && 'statusCode' in error && typeof error.statusCode === 'number'
  ? error.statusCode
  : undefined;
```

### 5. Validating Stripe Objects

```typescript
// ❌ OLD WAY (unsafe)
const pm = subscription.default_payment_method as Stripe.PaymentMethod;

// ✅ NEW WAY (type-safe)
if (subscription.default_payment_method && typeof subscription.default_payment_method !== 'string') {
  const pm = subscription.default_payment_method;
  if (isStripePaymentMethod(pm)) {
    const brand = pm.card?.brand ?? null;
    const last4 = pm.card?.last4 ?? null;
  }
}
```

### 6. Creating Custom Type Guards

```typescript
// Using Zod schema
const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string()
});

const isUser = createZodGuard(UserSchema);

// Usage
if (isUser(data)) {
  // data is now User type
  console.log(data.email);
}
```

### 7. Safe Property Extraction

```typescript
import { extractStringProperty, extractNumberProperty } from '@/lib/utils/type-guards';

// Extract with validation
const name = extractStringProperty(metadata, 'userName');
const age = extractNumberProperty(metadata, 'userAge');

// Both return string | undefined and number | undefined
if (name && age) {
  console.log(`${name} is ${age} years old`);
}
```

## Available Type Guards

### Basic Guards
- `isObject(value)` - Check if value is a non-null object
- `isNonEmptyString(value)` - Check if value is a non-empty string
- `isNumber(value)` - Check if value is a valid number (not NaN)
- `isPositiveInteger(value)` - Check if value is an integer > 0
- `isNonNegativeInteger(value)` - Check if value is an integer >= 0
- `isArray(value)` - Check if value is an array
- `isArrayOf(value, guard)` - Check if value is an array of specific type

### Domain-Specific Guards
- `isTextPart(value)` - Validate AI SDK text part structure
- `isToolCall(value)` - Validate AI SDK tool call structure
- `isStripePaymentMethod(value)` - Validate Stripe PaymentMethod
- `hasPeriodTimestamps(value)` - Check for billing period timestamps
- `hasBillingCycleAnchor(value)` - Check for billing cycle anchor

### Advanced Guards
- `hasProperty(obj, key, guard)` - Check object has property with specific type
- `hasShape(value, shape)` - Validate object shape with type guards
- `extractProperty(obj, key, guard)` - Extract property with type validation
- `extractStringProperty(obj, key)` - Extract string property safely
- `extractNumberProperty(obj, key)` - Extract number property safely

### Zod Integration
- `createZodGuard(schema)` - Create type guard from Zod schema
- `safeParse(schema, value)` - Parse with undefined fallback

## When to Use Each Guard

### Use `safeParse()` when:
- Validating enum values
- Validating complex nested objects
- You already have a Zod schema defined
- You need detailed validation errors

### Use `isTextPart()` when:
- Filtering AI SDK message parts
- Extracting text content from messages
- Processing streaming deltas

### Use `isObject()` when:
- Checking unknown values before property access
- Validating API responses
- Type narrowing before detailed checks

### Use `createZodGuard()` when:
- You need reusable validation across multiple places
- You want to leverage existing Zod schemas
- You need consistent validation logic

## Error Handling

### Pattern: Validate and Handle Failure

```typescript
const validated = safeParse(Schema, data);
if (!validated) {
  // Option 1: Early return
  return;

  // Option 2: Throw error
  throw new Error('Validation failed');

  // Option 3: Use fallback
  const fallback = getDefaultValue();
}

// Continue with validated data
processData(validated);
```

### Pattern: Validate with Error Context

```typescript
const validatedStatus = safeParse(StripeSubscriptionStatusSchema, subscription.status);
if (!validatedStatus) {
  throw createError.internal(`Invalid subscription status: ${subscription.status}`, {
    errorType: 'validation',
    field: 'subscription.status',
    resourceId: subscription.id,
  });
}
```

## Testing Type Guards

```typescript
import { isTextPart, isToolCall } from '@/lib/utils/type-guards';

describe('Type Guards', () => {
  describe('isTextPart', () => {
    it('validates correct text part', () => {
      expect(isTextPart({ type: 'text', text: 'hello' })).toBe(true);
    });

    it('rejects invalid text part', () => {
      expect(isTextPart({ type: 'image', url: 'https://...' })).toBe(false);
      expect(isTextPart(null)).toBe(false);
      expect(isTextPart(undefined)).toBe(false);
    });
  });

  describe('isToolCall', () => {
    it('validates correct tool call', () => {
      expect(isToolCall({ toolName: 'search', input: { query: 'test' } })).toBe(true);
    });

    it('rejects invalid tool call', () => {
      expect(isToolCall({ input: {} })).toBe(false); // missing toolName
      expect(isToolCall({ toolName: '' })).toBe(false); // empty toolName
    });
  });
});
```

## Migration Checklist

When replacing type assertions:

1. ✅ Identify the type assertion (`as Type`)
2. ✅ Determine what validation is needed
3. ✅ Choose appropriate type guard
4. ✅ Replace assertion with guard check
5. ✅ Handle validation failure case
6. ✅ Verify TypeScript infers correct type
7. ✅ Test with valid and invalid data

## See Also

- `/TYPE_GUARD_MIGRATION.md` - Complete migration summary
- `/docs/frontend-patterns.md` - Frontend architecture patterns
- `/src/lib/utils/type-guards.ts` - Type guard source code
