/**
 * Hono RPC Client
 *
 * Type-safe API client following Hono's RPC pattern for large applications.
 * https://hono.dev/docs/guides/rpc#split-your-application
 *
 * Due to TypeScript TS7056 limits, we can't use a single intersection type.
 * Instead, we create individual typed clients that share the same base URL.
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
// Types
// ============================================================================

export type ClientOptions = {
  cookieHeader?: string | undefined;
  signal?: AbortSignal | undefined;
  bypassCache?: boolean | undefined;
};

// Individual client types for each route group
type HealthAuthClient = ReturnType<typeof hc<HealthAuthRoutesType>>;
type BillingClient = ReturnType<typeof hc<BillingRoutesType>>;
type ChatThreadClient = ReturnType<typeof hc<ChatThreadRoutesType>>;
type ChatMessageClient = ReturnType<typeof hc<ChatMessageRoutesType>>;
type ChatFeatureClient = ReturnType<typeof hc<ChatFeatureRoutesType>>;
type ProjectClient = ReturnType<typeof hc<ProjectRoutesType>>;
type AdminClient = ReturnType<typeof hc<AdminRoutesType>>;
type UtilityClient = ReturnType<typeof hc<UtilityRoutesType>>;
type UploadClient = ReturnType<typeof hc<UploadRoutesType>>;
type TestClient = ReturnType<typeof hc<TestRoutesType>>;

/**
 * Combined API client type - intersection of all route group clients
 * Used for type inference in service files
 */
export type ApiClientType
  = HealthAuthClient
    & BillingClient
    & ChatThreadClient
    & ChatMessageClient
    & ChatFeatureClient
    & ProjectClient
    & AdminClient
    & UtilityClient
    & UploadClient
    & TestClient;

// ============================================================================
// Client Factory
// ============================================================================

// Cache for client instances per config
const clientCache = new WeakMap<object, ApiClientType>();
const defaultKey = {};

/**
 * Create type-safe API client
 *
 * Creates typed clients for each route group and merges them via Proxy.
 * Hono's hc() returns Proxy objects - we need a meta-proxy to delegate.
 */
export function createApiClient(options?: ClientOptions): ApiClientType {
  // Use cached client for default options
  const cacheKey = options ?? defaultKey;
  const cached = !options ? clientCache.get(cacheKey) : undefined;
  if (cached) {
    return cached;
  }

  const baseUrl = getApiBaseUrl();
  const config = {
    fetch: buildFetch(options),
    headers: buildHeaders(options),
  };

  // Create typed clients for each route group
  const clients = {
    admin: hc<AdminRoutesType>(baseUrl, config),
    billing: hc<BillingRoutesType>(baseUrl, config),
    chatFeature: hc<ChatFeatureRoutesType>(baseUrl, config),
    chatMessage: hc<ChatMessageRoutesType>(baseUrl, config),
    chatThread: hc<ChatThreadRoutesType>(baseUrl, config),
    healthAuth: hc<HealthAuthRoutesType>(baseUrl, config),
    project: hc<ProjectRoutesType>(baseUrl, config),
    test: hc<TestRoutesType>(baseUrl, config),
    upload: hc<UploadRoutesType>(baseUrl, config),
    utility: hc<UtilityRoutesType>(baseUrl, config),
  };

  // Route namespace to client mapping
  const namespaceMap: Record<string, keyof typeof clients> = {
    admin: 'admin',
    auth: 'healthAuth',
    billing: 'billing',
    chat: 'chatThread', // Primary, will check others too
    credits: 'utility',
    health: 'healthAuth',
    mcp: 'utility',
    models: 'utility',
    og: 'healthAuth',
    projects: 'project',
    system: 'healthAuth',
    test: 'test',
    uploads: 'upload',
    usage: 'utility',
  };

  // Chat namespace needs special handling (spans 3 clients)
  const chatClients = [clients.chatThread, clients.chatMessage, clients.chatFeature];

  const proxy = new Proxy({} as ApiClientType, {
    get(_, prop: string) {
      // Handle chat namespace - try all chat clients
      if (prop === 'chat') {
        return new Proxy({}, {
          get(_, chatProp: string) {
            for (const client of chatClients) {
              const chatNs = (client as Record<string, unknown>).chat as Record<string, unknown> | undefined;
              if (chatNs?.[chatProp] !== undefined) {
                return chatNs[chatProp];
              }
            }
            return undefined;
          },
        });
      }

      // Direct namespace mapping
      const clientKey = namespaceMap[prop];
      if (clientKey) {
        return (clients[clientKey] as Record<string, unknown>)[prop];
      }

      // Fallback: search all clients
      for (const client of Object.values(clients)) {
        const val = (client as Record<string, unknown>)[prop];
        if (val !== undefined) {
          return val;
        }
      }

      return undefined;
    },
  });

  if (!options) {
    clientCache.set(cacheKey, proxy);
  }

  return proxy;
}

export const createPublicApiClient = createApiClient;

// ============================================================================
// Helpers
// ============================================================================

function buildHeaders(options?: ClientOptions): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options?.cookieHeader) {
    headers.Cookie = options.cookieHeader;
  }
  if (options?.bypassCache) {
    headers['Cache-Control'] = 'no-cache';
    headers.Pragma = 'no-cache';
  }
  return headers;
}

function buildFetch(options?: ClientOptions): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...init,
      credentials: 'include',
      ...(options?.bypassCache && { cache: 'no-cache' as RequestCache }),
      ...(options?.signal && { signal: options.signal }),
    });
}

// ============================================================================
// Non-RPC Fetch (multipart/binary)
// ============================================================================

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
 * Type for authenticated fetch init options (extends RequestInit)
 */
type AuthenticatedFetchInit = RequestInit & {
  searchParams?: Record<string, string>;
};

export async function authenticatedFetch(
  path: string,
  init: AuthenticatedFetchInit,
): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  const fullBaseUrl = baseUrl.startsWith('/') && typeof window !== 'undefined'
    ? `${window.location.origin}${baseUrl}`
    : baseUrl;

  const url = new URL(`${fullBaseUrl}${path}`);
  if (init.searchParams) {
    Object.entries(init.searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const response = await fetch(url.toString(), { ...init, credentials: 'include' });
  if (!response.ok) {
    throw new ServiceFetchError(`Request failed: ${response.statusText}`, response.status, response.statusText);
  }
  return response;
}

// ============================================================================
// Default Instance
// ============================================================================

export const apiClient = createApiClient();
