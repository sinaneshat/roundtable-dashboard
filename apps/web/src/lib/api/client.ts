/**
 * Hono RPC Client
 *
 * Type-safe API client using Hono's RPC pattern.
 * https://hono.dev/docs/guides/rpc
 *
 * Due to TS7056 with 100+ routes, we create separate hc() clients per route group.
 * Access pattern: client.{clientName}.{routePrefix}.{path}
 *   e.g., client.billing.billing.products.$get()
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

// Individual client types - standard hc<RouteType>() pattern
export type HealthAuthClient = ReturnType<typeof hc<HealthAuthRoutesType>>;
export type BillingClient = ReturnType<typeof hc<BillingRoutesType>>;
export type ChatThreadClient = ReturnType<typeof hc<ChatThreadRoutesType>>;
export type ChatMessageClient = ReturnType<typeof hc<ChatMessageRoutesType>>;
export type ChatFeatureClient = ReturnType<typeof hc<ChatFeatureRoutesType>>;
export type ProjectClient = ReturnType<typeof hc<ProjectRoutesType>>;
export type AdminClient = ReturnType<typeof hc<AdminRoutesType>>;
export type UtilityClient = ReturnType<typeof hc<UtilityRoutesType>>;
export type UploadClient = ReturnType<typeof hc<UploadRoutesType>>;
export type TestClient = ReturnType<typeof hc<TestRoutesType>>;

/**
 * API Client interface - separate clients per route group
 *
 * Access patterns:
 *   client.billing.billing.products.$get()
 *   client.chatThread.chat.threads.$get()
 *   client.chatMessage.chat.threads['{id}'].messages.$get()
 *   client.chatFeature.chat['custom-roles'].$get()
 *   client.admin.admin.users.search.$get()
 *   client.healthAuth.auth.me.$get()
 *   client.utility.models.$get()
 *   client.project.projects.$get()
 *   client.upload.uploads.$get()
 */
// eslint-disable-next-line ts/consistent-type-definitions
export interface ApiClientType {
  admin: AdminClient;
  billing: BillingClient;
  chatFeature: ChatFeatureClient;
  chatMessage: ChatMessageClient;
  chatThread: ChatThreadClient;
  healthAuth: HealthAuthClient;
  project: ProjectClient;
  test: TestClient;
  upload: UploadClient;
  utility: UtilityClient;
}

export type ApiClient = ApiClientType;

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
// Client Factory
// ============================================================================

let cachedClient: ApiClientType | null = null;

export function createApiClient(options?: ClientOptions): ApiClientType {
  if (!options && cachedClient) {
    return cachedClient;
  }

  const baseUrl = getApiBaseUrl();
  const config = {
    fetch: buildFetch(options),
    headers: buildHeaders(options),
  };

  const client: ApiClientType = {
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

  if (!options) {
    cachedClient = client;
  }

  return client;
}

export const createPublicApiClient = createApiClient;

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
