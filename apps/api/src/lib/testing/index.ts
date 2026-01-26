/**
 * Testing utilities for API tests
 */

import { InvoiceStatuses } from '@roundtable/shared/enums';
import { vi } from 'vitest';

import type { TypedLogger } from '@/types/logger';

// ============================================================================
// Safe Property Access Helper
// ============================================================================

/**
 * Safely get a property from a StripeEventObjectData using bracket notation
 * This satisfies TS4111 noPropertyAccessFromIndexSignature
 */
function getDataProp<T>(obj: Record<string, T>, key: string): T | undefined {
  return obj[key];
}

// ============================================================================
// Mock Types
// ============================================================================

/**
 * Stripe event data values - constrained to JSON-serializable primitives
 * Matches Stripe's actual webhook payload structure
 */
type StripeEventDataValue = string | number | boolean | null | undefined;

/**
 * Stripe event object data - supports nested objects and arrays
 * Matches Stripe webhook `event.data.object` structure
 */
type StripeEventObjectData = {
  [key: string]: StripeEventDataValue | StripeEventObjectData | StripeEventDataValue[] | StripeEventObjectData[];
};

export type MockStripeEvent = {
  id: string;
  type: string;
  data: {
    object: StripeEventObjectData;
  };
  customer?: string;
};

export type MockStripeSubscription = {
  id: string;
  customer: string;
  status: string;
  items: {
    data: {
      price: {
        id: string;
        product: string;
      };
    }[];
  };
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
};

export type MockStripeInvoice = {
  id: string;
  customer: string;
  status: string;
  subscription?: string;
  amount_due: number;
  amount_paid: number;
  paid: boolean;
};

export type MockDrizzleDb = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  query: Record<string, {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  }>;
  batch: ReturnType<typeof vi.fn>;
};

// ============================================================================
// Mock Factories
// ============================================================================

export function createMockStripeEvent(
  type: string,
  data: StripeEventObjectData,
): MockStripeEvent {
  // Build result with optional customer property (satisfies exactOptionalPropertyTypes)
  const dataCustomer = getDataProp(data, 'customer');
  const result: MockStripeEvent = {
    data: {
      object: data,
    },
    id: `evt_${Math.random().toString(36).substring(7)}`,
    type,
  };
  if (typeof dataCustomer === 'string') {
    result.customer = dataCustomer;
  }
  return result;
}

export function createMockStripeSubscription(
  overrides: Partial<MockStripeSubscription> = {},
): MockStripeSubscription {
  return {
    cancel_at_period_end: false,
    current_period_end: Math.floor(Date.now() / 1000) + 2592000, // +30 days
    current_period_start: Math.floor(Date.now() / 1000),
    customer: `cus_${Math.random().toString(36).substring(7)}`,
    id: `sub_${Math.random().toString(36).substring(7)}`,
    items: {
      data: [
        {
          price: {
            id: `price_${Math.random().toString(36).substring(7)}`,
            product: `prod_${Math.random().toString(36).substring(7)}`,
          },
        },
      ],
    },
    status: 'active',
    ...overrides,
  };
}

export function createMockStripeInvoice(
  overrides: Partial<MockStripeInvoice> = {},
): MockStripeInvoice {
  const status = overrides.status || InvoiceStatuses.PAID;
  const isPaid = status === InvoiceStatuses.PAID;

  return {
    amount_due: 2000,
    amount_paid: isPaid ? 2000 : 0,
    customer: `cus_${Math.random().toString(36).substring(7)}`,
    id: `in_${Math.random().toString(36).substring(7)}`,
    paid: isPaid,
    status,
    ...overrides,
  };
}

/**
 * Create a mock Drizzle DB for testing
 *
 * ✅ JUSTIFIED TYPE ASSERTIONS: Test mocks use Proxy for dynamic table access.
 * TypeScript cannot infer that Proxy returns the correct shape for all table names.
 * The mock structure is verified at runtime by vitest mock machinery.
 */
export function createMockDrizzleDb(): MockDrizzleDb {
  const queryCache = new Map<string | symbol, {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  }>();

  return {
    batch: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    // ✅ JUSTIFIED: Proxy returns cached mock objects for any table name access
    query: new Proxy({}, {
      get: (_target, prop) => {
        if (!queryCache.has(prop)) {
          queryCache.set(prop, {
            findFirst: vi.fn().mockResolvedValue(null),
            findMany: vi.fn().mockResolvedValue([]),
          });
        }
        return queryCache.get(prop);
      },
    }) as Record<string, {
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    }>,
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };
}

/**
 * Create a mock KV namespace for testing
 *
 * ✅ JUSTIFIED TYPE ASSERTION: KVNamespace has many methods but tests only need
 * a subset. Partial<KVNamespace> is used for construction, then cast to full type
 * since unused methods won't be called in tests.
 */
export function createMockKV(): KVNamespace {
  const mockKV: Partial<KVNamespace> = {
    delete: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    getWithMetadata: vi.fn().mockResolvedValue({ metadata: null, value: null }),
    list: vi.fn().mockResolvedValue({ keys: [] }),
    put: vi.fn().mockResolvedValue(undefined),
  };
  // ✅ JUSTIFIED: Tests only use mocked methods; other KVNamespace methods are unused
  return mockKV as KVNamespace;
}

export function createMockLogger(): TypedLogger {
  const mockLogger: TypedLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
  return mockLogger;
}

export function createMockApiEnv(overrides?: Partial<CloudflareEnv>): Partial<CloudflareEnv> {
  const mockEnv: Partial<CloudflareEnv> = {
    BETTER_AUTH_SECRET: 'test-secret',
    BETTER_AUTH_URL: 'http://localhost:8787',
    KV: createMockKV(),
    STRIPE_SECRET_KEY: 'sk_test_mock',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_mock',
    ...overrides,
  };

  // DB and R2 are intentionally omitted as they require proper mocking setup
  return mockEnv;
}
