/**
 * Hono RPC Client for TanStack Start
 *
 * This client provides type-safe access to the backend API using Hono's RPC functionality.
 * It connects to the separate @roundtable/api worker.
 *
 * Type Safety:
 * - Route group types are imported from @roundtable/api (dev dependency for types only)
 * - hc<RouteType>() provides end-to-end type safety per route group
 * - Service functions use InferRequestType/InferResponseType from hono/client
 *
 * Architecture:
 * Due to TypeScript's TS7056 limit on type serialization, we use separate clients
 * for each route group. This is the recommended pattern from Hono docs for large APIs.
 */

import type {
  AdminRoutesType,
  BillingRoutesType,
  ChatFeatureRoutesType,
  ChatMessageRoutesType,
  ChatThreadRoutesType,
  HealthAuthRoutesType,
  ProjectRoutesType,
  TestRoutesType,
  UploadRoutesType,
  UtilityRoutesType,
} from '@roundtable/api';
import { hc } from 'hono/client';

import { getApiBaseUrl } from '@/lib/config/base-urls';

// ============================================================================
// Type Definitions - Per Route Group
// ============================================================================

/** Health & Auth routes client type */
export type HealthAuthClientType = ReturnType<typeof hc<HealthAuthRoutesType>>;

/** Billing routes client type */
export type BillingClientType = ReturnType<typeof hc<BillingRoutesType>>;

/** Chat thread routes client type */
export type ChatThreadClientType = ReturnType<typeof hc<ChatThreadRoutesType>>;

/** Chat message routes client type */
export type ChatMessageClientType = ReturnType<typeof hc<ChatMessageRoutesType>>;

/** Chat feature routes client type */
export type ChatFeatureClientType = ReturnType<typeof hc<ChatFeatureRoutesType>>;

/** Project routes client type */
export type ProjectClientType = ReturnType<typeof hc<ProjectRoutesType>>;

/** Admin routes client type */
export type AdminClientType = ReturnType<typeof hc<AdminRoutesType>>;

/** Utility routes client type */
export type UtilityClientType = ReturnType<typeof hc<UtilityRoutesType>>;

/** Upload routes client type */
export type UploadClientType = ReturnType<typeof hc<UploadRoutesType>>;

/** Test routes client type */
export type TestClientType = ReturnType<typeof hc<TestRoutesType>>;

/**
 * Combined API client type - Union of all route group clients
 *
 * This provides access to all routes through a single client interface.
 * The intersection combines route paths from all groups.
 */
export type ApiClientType
  = & HealthAuthClientType
    & BillingClientType
    & ChatThreadClientType
    & ChatMessageClientType
    & ChatFeatureClientType
    & ProjectClientType
    & AdminClientType
    & UtilityClientType
    & UploadClientType
    & TestClientType;

// ============================================================================
// Client Options Type
// ============================================================================

type ClientOptions = {
  bypassCache?: boolean;
  cookieHeader?: string;
  signal?: AbortSignal;
};

// ============================================================================
// Internal Client Factory
// ============================================================================

function createFetch(options?: ClientOptions): typeof fetch {
  return (input, init) => {
    return fetch(input, {
      ...init,
      credentials: 'include',
      ...(options?.bypassCache && { cache: 'no-cache' as RequestCache }),
      ...(options?.signal && { signal: options.signal }),
    });
  };
}

function createHeaders(options?: ClientOptions): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (options?.bypassCache) {
    headers['Cache-Control'] = 'no-cache';
    headers.Pragma = 'no-cache';
  }

  if (options?.cookieHeader) {
    headers.Cookie = options.cookieHeader;
  }

  return headers;
}

// ============================================================================
// Per-Group Client Factories
// ============================================================================

/** Create health/auth routes client */
export function createHealthAuthClient(options?: ClientOptions): HealthAuthClientType {
  return hc<HealthAuthRoutesType>(getApiBaseUrl(), {
    headers: createHeaders(options),
    fetch: createFetch(options),
  });
}

/** Create billing routes client */
export function createBillingClient(options?: ClientOptions): BillingClientType {
  return hc<BillingRoutesType>(getApiBaseUrl(), {
    headers: createHeaders(options),
    fetch: createFetch(options),
  });
}

/** Create chat thread routes client */
export function createChatThreadClient(options?: ClientOptions): ChatThreadClientType {
  return hc<ChatThreadRoutesType>(getApiBaseUrl(), {
    headers: createHeaders(options),
    fetch: createFetch(options),
  });
}

/** Create chat message routes client */
export function createChatMessageClient(options?: ClientOptions): ChatMessageClientType {
  return hc<ChatMessageRoutesType>(getApiBaseUrl(), {
    headers: createHeaders(options),
    fetch: createFetch(options),
  });
}

/** Create chat feature routes client */
export function createChatFeatureClient(options?: ClientOptions): ChatFeatureClientType {
  return hc<ChatFeatureRoutesType>(getApiBaseUrl(), {
    headers: createHeaders(options),
    fetch: createFetch(options),
  });
}

/** Create project routes client */
export function createProjectClient(options?: ClientOptions): ProjectClientType {
  return hc<ProjectRoutesType>(getApiBaseUrl(), {
    headers: createHeaders(options),
    fetch: createFetch(options),
  });
}

/** Create admin routes client */
export function createAdminClient(options?: ClientOptions): AdminClientType {
  return hc<AdminRoutesType>(getApiBaseUrl(), {
    headers: createHeaders(options),
    fetch: createFetch(options),
  });
}

/** Create utility routes client */
export function createUtilityClient(options?: ClientOptions): UtilityClientType {
  return hc<UtilityRoutesType>(getApiBaseUrl(), {
    headers: createHeaders(options),
    fetch: createFetch(options),
  });
}

/** Create upload routes client */
export function createUploadClient(options?: ClientOptions): UploadClientType {
  return hc<UploadRoutesType>(getApiBaseUrl(), {
    headers: createHeaders(options),
    fetch: createFetch(options),
  });
}

/** Create test routes client */
export function createTestClient(options?: ClientOptions): TestClientType {
  return hc<TestRoutesType>(getApiBaseUrl(), {
    headers: createHeaders(options),
    fetch: createFetch(options),
  });
}

// ============================================================================
// Combined Client Factory (Legacy Support)
//
// Returns an object with all route clients merged. Services can access
// routes through this unified interface.
// ============================================================================

/**
 * Create a combined API client with all route groups
 *
 * This provides backward compatibility for existing services that expect
 * a single client with all routes. Internally creates separate typed clients
 * and merges them.
 *
 * @param options - Client options
 * @returns Combined client with access to all routes
 */
export function createApiClient(options?: ClientOptions): ApiClientType {
  const baseUrl = getApiBaseUrl();
  const clientOptions = {
    headers: createHeaders(options),
    fetch: createFetch(options),
  };

  // Create all clients and merge them
  // The types are combined via intersection, routes are accessed on same base URL
  const healthAuth = hc<HealthAuthRoutesType>(baseUrl, clientOptions);
  const billing = hc<BillingRoutesType>(baseUrl, clientOptions);
  const chatThread = hc<ChatThreadRoutesType>(baseUrl, clientOptions);
  const chatMessage = hc<ChatMessageRoutesType>(baseUrl, clientOptions);
  const chatFeature = hc<ChatFeatureRoutesType>(baseUrl, clientOptions);
  const project = hc<ProjectRoutesType>(baseUrl, clientOptions);
  const admin = hc<AdminRoutesType>(baseUrl, clientOptions);
  const utility = hc<UtilityRoutesType>(baseUrl, clientOptions);
  const upload = hc<UploadRoutesType>(baseUrl, clientOptions);
  const test = hc<TestRoutesType>(baseUrl, clientOptions);

  // Merge all clients into one object
  // TypeScript will see this as the intersection type
  return {
    ...healthAuth,
    ...billing,
    ...chatThread,
    ...chatMessage,
    ...chatFeature,
    ...project,
    ...admin,
    ...utility,
    ...upload,
    ...test,
  } as ApiClientType;
}

/**
 * Create a public API client without authentication
 *
 * For public endpoints that don't require authentication.
 */
export function createPublicApiClient(): ApiClientType {
  return createApiClient();
}

// ============================================================================
// Authenticated Fetch Utility - For non-RPC requests (multipart, binary)
// ============================================================================

/**
 * Service fetch error with structured information
 */
export class ServiceFetchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string,
  ) {
    super(message);
    this.name = 'ServiceFetchError';
  }
}

/**
 * Authenticated fetch for non-RPC requests
 *
 * Use this for special cases where Hono RPC client doesn't work:
 * - multipart/form-data uploads
 * - application/octet-stream binary uploads
 *
 * @param path - API path (e.g., '/uploads/ticket/upload')
 * @param init - Fetch init options (method, body, headers)
 * @returns Response object
 * @throws ServiceFetchError if response is not ok
 */
export async function authenticatedFetch(
  path: string,
  init: RequestInit & { searchParams?: Record<string, string> },
): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  const isRelativeUrl = baseUrl.startsWith('/');
  const fullBaseUrl = isRelativeUrl && typeof window !== 'undefined'
    ? `${window.location.origin}${baseUrl}`
    : baseUrl;
  const url = new URL(`${fullBaseUrl}${path}`);

  // Add search params if provided
  if (init.searchParams) {
    for (const [key, value] of Object.entries(init.searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    ...init,
    credentials: 'include',
  });

  if (!response.ok) {
    throw new ServiceFetchError(
      `Request failed: ${response.statusText}`,
      response.status,
      response.statusText,
    );
  }

  return response;
}

// ============================================================================
// Singleton Client Instance
// ============================================================================

/**
 * Default API client instance
 *
 * Use this for most API calls. Create a new client with createApiClient()
 * if you need custom options like cache bypassing.
 */
export const apiClient = createApiClient();
