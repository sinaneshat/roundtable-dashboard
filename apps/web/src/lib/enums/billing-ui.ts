/**
 * Billing UI Enums
 *
 * Enums specific to billing UI components and credit management.
 */

import { z } from 'zod';

// ============================================================================
// CREDIT ESTIMATION STATUS
// ============================================================================

// 1. ARRAY CONSTANT
export const CREDIT_ESTIMATION_STATUSES = ['sufficient', 'low', 'insufficient'] as const;

// 2. ZOD SCHEMA
export const CreditEstimationStatusSchema = z.enum(CREDIT_ESTIMATION_STATUSES);

// 3. TYPESCRIPT TYPE (inferred from Zod)
export type CreditEstimationStatus = z.infer<typeof CreditEstimationStatusSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_CREDIT_ESTIMATION_STATUS: CreditEstimationStatus = 'sufficient';

// 5. CONSTANT OBJECT
export const CreditEstimationStatuses = {
  INSUFFICIENT: 'insufficient' as const,
  LOW: 'low' as const,
  SUFFICIENT: 'sufficient' as const,
} as const;

// 6. TYPE GUARD (uses Zod safeParse - no type cast)
export function isCreditEstimationStatus(value: unknown): value is CreditEstimationStatus {
  return CreditEstimationStatusSchema.safeParse(value).success;
}

// 7. PARSE FUNCTION (returns typed value or undefined)
export function parseCreditEstimationStatus(value: unknown): CreditEstimationStatus | undefined {
  const result = CreditEstimationStatusSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

// 8. DISPLAY LABELS
export const CREDIT_ESTIMATION_STATUS_LABELS: Record<CreditEstimationStatus, string> = {
  [CreditEstimationStatuses.INSUFFICIENT]: 'Insufficient Credits',
  [CreditEstimationStatuses.LOW]: 'Low Credits',
  [CreditEstimationStatuses.SUFFICIENT]: 'Sufficient Credits',
} as const;
