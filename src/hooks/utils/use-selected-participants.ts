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

import type { ParticipantConfig } from '@/lib/types/participant-config';

export type UseSelectedParticipantsReturn = {
  /** Current selected participants */
  selectedParticipants: ParticipantConfig[];
  /** Update selected participants */
  setSelectedParticipants: (participants: ParticipantConfig[]) => void;
  /** Remove a participant by ID */
  handleRemoveParticipant: (participantId: string) => void;
  /** Add a new participant */
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
  // ✅ REACT 19: Use factory function to initialize state only once
  // This prevents re-initialization on every render and avoids stale closures
  const [selectedParticipants, setSelectedParticipants] = useState<ParticipantConfig[]>(
    () => initialParticipants,
  );

  /**
   * Remove a participant and reindex remaining participants
   */
  const handleRemoveParticipant = useCallback((participantId: string) => {
    setSelectedParticipants((prev) => {
      // Filter out the removed participant
      const filtered = prev.filter(p => p.id !== participantId);

      // Reindex the remaining participants to maintain continuous order
      const reindexed = filtered.map((p, index) => ({
        ...p,
        order: index,
      }));

      return reindexed;
    });
  }, []);

  /**
   * Add a new participant with proper ordering
   */
  const handleAddParticipant = useCallback((participant: ParticipantConfig) => {
    setSelectedParticipants((prev) => {
      // Add participant with order set to the end
      const newParticipant = {
        ...participant,
        order: prev.length,
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

      // Reindex all participants after reordering
      return copy.map((p, index) => ({
        ...p,
        order: index,
      }));
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
