/**
 * Shared Participant Configuration State Hook
 *
 * Centralized state management for participant selection and configuration.
 * Eliminates duplication between ChatOverviewScreen and ChatThreadScreen.
 *
 * ✅ SINGLE SOURCE OF TRUTH: Participant state management
 * ✅ REUSABLE: Used by both overview and thread screens
 * ✅ TYPE-SAFE: Proper TypeScript types for all state and handlers
 *
 * Used by:
 * - /src/containers/screens/chat/ChatOverviewScreen.tsx
 * - /src/containers/screens/chat/ChatThreadScreen.tsx
 *
 * Reference: COMPREHENSIVE REFACTORING ANALYSIS:1.1
 */

'use client';

import { useCallback, useState } from 'react';
import { z } from 'zod';

import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';
import { ParticipantConfigSchema } from '@/components/chat/chat-form-schemas';
import { reindexParticipantPriorities } from '@/lib/utils/participant';

/**
 * Zod schema for initial participants validation
 */
const InitialParticipantsSchema = z.array(ParticipantConfigSchema);

export type UseSelectedParticipantsReturn = {
  /** Current selected participants */
  selectedParticipants: ParticipantConfig[];
  /** Update selected participants */
  setSelectedParticipants: (participants: ParticipantConfig[]) => void;
  /** Remove a participant by ID or modelId (supports both for flexibility) */
  handleRemoveParticipant: (participantId: string) => void;
  /** Add a new participant (deduplicates by modelId) */
  handleAddParticipant: (participant: ParticipantConfig) => void;
  /** Update a participant by ID */
  handleUpdateParticipant: (participantId: string, updates: Partial<ParticipantConfig>) => void;
  /** Reorder participants */
  handleReorderParticipants: (fromIndex: number, toIndex: number) => void;
};

/**
 * Hook for managing participant selection and configuration
 *
 * ✅ REACT 19 PATTERN: This hook intentionally does NOT sync with prop changes
 * to avoid infinite loops. If you need to reset participants, use the key prop
 * on the parent component or call setSelectedParticipants directly.
 *
 * @param initialParticipants - Initial participants to populate state (only used on mount)
 * @returns Participant state and handlers
 *
 * @example
 * const {
 *   selectedParticipants,
 *   handleRemoveParticipant,
 *   handleAddParticipant
 * } = useSelectedParticipants(initialParticipants)
 */
export function useSelectedParticipants(
  initialParticipants: ParticipantConfig[] = [],
): UseSelectedParticipantsReturn {
  // Validate initial participants
  const validatedInitialParticipants = InitialParticipantsSchema.parse(initialParticipants);

  // ✅ REACT 19: Use factory function to initialize state only once
  // This prevents re-initialization on every render and avoids stale closures
  const [selectedParticipants, setSelectedParticipants] = useState<ParticipantConfig[]>(
    () => validatedInitialParticipants,
  );

  /**
   * Remove a participant and reindex remaining participants
   * Supports removal by id OR modelId for consistency with add logic
   *
   * @param participantId - Either database ID or modelId to identify participant
   */
  const handleRemoveParticipant = useCallback((participantId: string) => {
    setSelectedParticipants((prev) => {
      const filtered = prev.filter(p => p.id !== participantId && p.modelId !== participantId);
      // ✅ SINGLE SOURCE OF TRUTH: Use shared utility for reindexing
      return reindexParticipantPriorities(filtered);
    });
  }, []);

  /**
   * Add a new participant with proper priority ordering
   * ✅ DEDUPLICATION: Prevents adding duplicate participants by modelId
   */
  const handleAddParticipant = useCallback((participant: ParticipantConfig) => {
    // Validate participant at function entry
    const validatedParticipant = ParticipantConfigSchema.parse(participant);

    setSelectedParticipants((prev) => {
      // ✅ DEDUPLICATION: Check if model is already selected by modelId
      const exists = prev.some(p => p.modelId === validatedParticipant.modelId);
      if (exists) {
        return prev; // Don't add duplicate
      }

      // Add participant with priority set to the end
      const newParticipant = {
        ...validatedParticipant,
        priority: prev.length,
      };

      return [...prev, newParticipant];
    });
  }, []);

  /**
   * Update a participant by ID
   */
  const handleUpdateParticipant = useCallback(
    (participantId: string, updates: Partial<ParticipantConfig>) => {
      setSelectedParticipants(prev =>
        prev.map(p =>
          p.id === participantId
            ? { ...p, ...updates }
            : p,
        ),
      );
    },
    [],
  );

  /**
   * Reorder participants by moving from one index to another
   */
  const handleReorderParticipants = useCallback((fromIndex: number, toIndex: number) => {
    setSelectedParticipants((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(fromIndex, 1);
      if (removed) {
        copy.splice(toIndex, 0, removed);
      }
      // ✅ SINGLE SOURCE OF TRUTH: Use shared utility for reindexing
      return reindexParticipantPriorities(copy);
    });
  }, []);

  return {
    selectedParticipants,
    setSelectedParticipants,
    handleRemoveParticipant,
    handleAddParticipant,
    handleUpdateParticipant,
    handleReorderParticipants,
  };
}
