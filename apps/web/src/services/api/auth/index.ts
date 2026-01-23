/**
 * Auth Services - Domain Barrel Export
 *
 * Single source of truth for all auth-related API services
 * Matches backend route structure: /api/v1/auth/*
 *
 * NOTE: Session management is handled by Better Auth hooks (useSession, getSession)
 * from @/lib/auth/client - do NOT create custom session services
 */

export {
  type CreateApiKeyRequest,
  type CreateApiKeyResponse,
  createApiKeyService,
  type DeleteApiKeyRequest,
  type DeleteApiKeyResponse,
  deleteApiKeyService,
  type GetApiKeyRequest,
  type GetApiKeyResponse,
  getApiKeyService,
  type ListApiKeysRequest,
  type ListApiKeysResponse,
  listApiKeysService,
  type UpdateApiKeyRequest,
  type UpdateApiKeyResponse,
  updateApiKeyService,
} from './api-keys';
export {
  type ClearOwnCacheResponse,
  clearOwnCacheService,
} from './clear-cache';
