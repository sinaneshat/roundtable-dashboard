/**
 * Testing utilities for API tests
 */

import { vi } from 'vitest';

import type { TypedLogger } from '@/types/logger';

// ============================================================================
// Mock Types
// ============================================================================

export type MockStripeEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
  customer?: string;
};

export type MockStripeSubscription = {
  id: string;
  customer: string;
  status: string;
  items: {
    data: Array<{
      price: {
        id: string;
        product: string;
      };
    }>;
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
  transaction: ReturnType<typeof vi.fn>;
  batch: ReturnType<typeof vi.fn>;
};

// ============================================================================
// Mock Factories
// ============================================================================

export function createMockStripeEvent(
  type: string,
  data: Record<string, unknown>,
): MockStripeEvent {
  return {
    id: `evt_${Math.random().toString(36).substring(7)}`,
    type,
    data: {
      object: data,
    },
    customer: data.customer as string | undefined,
  };
}

export function createMockStripeSubscription(
  overrides: Partial<MockStripeSubscription> = {},
): MockStripeSubscription {
  return {
    id: `sub_${Math.random().toString(36).substring(7)}`,
    customer: `cus_${Math.random().toString(36).substring(7)}`,
    status: 'active',
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
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 2592000, // +30 days
    cancel_at_period_end: false,
    ...overrides,
  };
}

export function createMockStripeInvoice(
  overrides: Partial<MockStripeInvoice> = {},
): MockStripeInvoice {
  const status = overrides.status || 'paid';
  const isPaid = status === 'paid';

  return {
    id: `in_${Math.random().toString(36).substring(7)}`,
    customer: `cus_${Math.random().toString(36).substring(7)}`,
    status,
    amount_due: 2000,
    amount_paid: isPaid ? 2000 : 0,
    paid: isPaid,
    ...overrides,
  };
}

export function createMockDrizzleDb(): MockDrizzleDb {
  const queryCache = new Map<string | symbol, {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  }>();

  return {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
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
    transaction: vi.fn(cb => cb(createMockDrizzleDb())),
    batch: vi.fn().mockResolvedValue([]),
  };
}

export function createMockKV(): KVNamespace {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ keys: [] }),
    getWithMetadata: vi.fn().mockResolvedValue({ value: null, metadata: null }),
  } as unknown as KVNamespace;
}

export function createMockLogger(): TypedLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

export function createMockApiEnv(overrides?: Partial<CloudflareEnv>): Partial<CloudflareEnv> {
  return {
    DB: null as unknown as D1Database,
    KV: createMockKV(),
    UPLOADS_R2_BUCKET: null as unknown as R2Bucket,
    BETTER_AUTH_SECRET: 'test-secret',
    BETTER_AUTH_URL: 'http://localhost:8787',
    STRIPE_SECRET_KEY: 'sk_test_mock',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_mock',
    ...overrides,
  };
}
