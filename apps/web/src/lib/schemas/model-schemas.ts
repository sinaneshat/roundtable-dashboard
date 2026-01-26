/**
 * Model Schema Definitions - Single Source of Truth
 *
 * Centralized Zod schemas for model-related types used across UI components.
 * Prevents schema duplication and ensures consistent validation.
 *
 * **SINGLE SOURCE OF TRUTH**: All components must import from here.
 * Do NOT duplicate these schemas inline.
 *
 * @module lib/schemas/model-schemas
 */

import { z } from 'zod';

import { ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';
import type { Model } from '@/services/api';

/**
 * ModelSchema - Custom Zod schema that accepts the RPC Model type
 * Uses z.custom<Model>() to trust the RPC type without duplicating validation
 */
export const ModelSchema = z.custom<Model>(
  (val): val is Model => {
    return (
      typeof val === 'object'
      && val !== null
      && 'id' in val
      && 'name' in val
      && 'provider' in val
    );
  },
  { message: 'Invalid Model object' },
);

// ============================================================================
// ORDERED MODEL SCHEMAS - UI MODEL SELECTION
// ============================================================================

/**
 * ✅ OrderedModel schema - Model with participant mapping and order
 *
 * Used for:
 * - Model selection modal
 * - Model ordering and drag-drop
 * - Model item display components
 * - useOrderedModels hook
 *
 * Combines Model from API with local participant config
 * and order information for UI rendering.
 *
 * @example
 * ```typescript
 * import { OrderedModelSchema } from '@/lib/schemas/model-schemas';
 *
 * const orderedModel = OrderedModelSchema.parse({
 *   model: modelResponse,
 *   participant: participantConfig || null,
 *   order: 0
 * });
 * ```
 */
export const OrderedModelSchema = z.object({
  model: ModelSchema,
  order: z.number().int().nonnegative(),
  participant: ParticipantConfigSchema.nullable(),
});

export type OrderedModel = z.infer<typeof OrderedModelSchema>;

/**
 * ✅ TYPE GUARD: Check if value is OrderedModel
 *
 * @param data - Data to validate
 * @returns True if data matches OrderedModelSchema
 *
 * @example
 * ```typescript
 * if (isOrderedModel(data)) {
 *   // data is OrderedModel
 *   const modelId = data.model.id;
 * }
 * ```
 */
export function isOrderedModel(data: unknown): data is OrderedModel {
  return OrderedModelSchema.safeParse(data).success;
}

/**
 * ✅ TYPE GUARD: Check if array contains valid OrderedModels
 *
 * @param data - Data to validate
 * @returns True if data is array of OrderedModel
 */
export function isOrderedModelArray(data: unknown): data is OrderedModel[] {
  const result = z.array(OrderedModelSchema).safeParse(data);
  return result.success;
}
