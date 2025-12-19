/**
 * User Presets Storage
 *
 * localStorage-based storage for user-created presets.
 * Designed for easy migration to database later.
 */

import type { ChatMode } from '@/api/core/enums';

const STORAGE_KEY = 'roundtable_user_presets';

export type UserPresetModelRole = {
  modelId: string;
  role: string;
};

export type UserPreset = {
  id: string;
  name: string;
  modelRoles: UserPresetModelRole[];
  mode: ChatMode;
  createdAt: number;
  updatedAt: number;
};

/**
 * Generate a unique ID for a preset
 */
function generateId(): string {
  return `user-preset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Get all user presets from localStorage
 */
export function getUserPresets(): UserPreset[] {
  if (typeof window === 'undefined')
    return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored)
      return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed))
      return [];

    return parsed as UserPreset[];
  } catch {
    console.error('[user-presets] Failed to parse stored presets');
    return [];
  }
}

/**
 * Save presets to localStorage
 */
function savePresets(presets: UserPreset[]): void {
  if (typeof window === 'undefined')
    return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch (error) {
    console.error('[user-presets] Failed to save presets:', error);
  }
}

/**
 * Create a new user preset
 */
export function createUserPreset(
  name: string,
  modelRoles: UserPresetModelRole[],
  mode: ChatMode,
): UserPreset {
  const presets = getUserPresets();
  const now = Date.now();

  const newPreset: UserPreset = {
    id: generateId(),
    name,
    modelRoles,
    mode,
    createdAt: now,
    updatedAt: now,
  };

  presets.unshift(newPreset); // Add to beginning
  savePresets(presets);

  return newPreset;
}

/**
 * Update an existing user preset
 */
export function updateUserPreset(
  id: string,
  updates: Partial<Pick<UserPreset, 'name' | 'modelRoles' | 'mode'>>,
): UserPreset | null {
  const presets = getUserPresets();
  const index = presets.findIndex(p => p.id === id);

  if (index === -1)
    return null;

  const updated: UserPreset = {
    ...presets[index]!,
    ...updates,
    updatedAt: Date.now(),
  };

  presets[index] = updated;
  savePresets(presets);

  return updated;
}

/**
 * Delete a user preset
 */
export function deleteUserPreset(id: string): boolean {
  const presets = getUserPresets();
  const filtered = presets.filter(p => p.id !== id);

  if (filtered.length === presets.length)
    return false;

  savePresets(filtered);
  return true;
}

/**
 * Get a single user preset by ID
 */
export function getUserPresetById(id: string): UserPreset | null {
  const presets = getUserPresets();
  return presets.find(p => p.id === id) ?? null;
}
