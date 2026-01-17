/**
 * API Client Module
 *
 * Exports the API client and related utilities for making
 * type-safe requests to the @roundtable/api backend.
 */

export type { ApiClientType } from './client';
export {
  apiClient,
  authenticatedFetch,
  createApiClient,
  createPublicApiClient,
  ServiceFetchError,
} from './client';
