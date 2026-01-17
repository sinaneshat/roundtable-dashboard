/**
 * Presets Services - Domain Barrel Export
 *
 * Single source of truth for all user preset-related API services
 * Matches backend route structure: /api/v1/chat/user-presets/*
 */

export {
  type CreateUserPresetRequest,
  type CreateUserPresetResponse,
  createUserPresetService,
  type DeleteUserPresetRequest,
  type DeleteUserPresetResponse,
  deleteUserPresetService,
  type GetUserPresetRequest,
  type GetUserPresetResponse,
  getUserPresetService,
  type ListUserPresetsRequest,
  type ListUserPresetsResponse,
  listUserPresetsService,
  type UpdateUserPresetRequest,
  type UpdateUserPresetResponse,
  updateUserPresetService,
} from './user-presets';
