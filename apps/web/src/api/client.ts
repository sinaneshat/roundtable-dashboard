/**
 * API Client Re-export
 *
 * Re-exports the API client from lib/api/client for backwards compatibility.
 * Services import from @/api/client for historical reasons.
 */

export {
  apiClient,
  type ApiClientType,
  authenticatedFetch,
  createApiClient,
  createPublicApiClient,
  ServiceFetchError,
} from '@/lib/api/client';
