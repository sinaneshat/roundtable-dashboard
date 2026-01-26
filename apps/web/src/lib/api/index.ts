/**
 * API Client Module
 *
 * Exports the API client and related utilities for making
 * type-safe requests to the @roundtable/api backend.
 */

export type { ApiClient } from './client';
export {
  apiClient,
  authenticatedFetch,
  createApiClient,
  ServiceFetchError,
} from './client';
