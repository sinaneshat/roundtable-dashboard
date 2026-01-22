/**
 * Billing UI Enums
 *
 * Enums specific to billing UI components and credit management.
 * Optimized: Zod schemas lazy-loaded to reduce initial bundle size.
 */

// ============================================================================
// CREDIT ESTIMATION STATUS
// ============================================================================

// 1. ARRAY CONSTANT
export const CREDIT_ESTIMATION_STATUSES = ['sufficient', 'low', 'insufficient'] as const;

// 2. TYPESCRIPT TYPE (no Zod dependency)
export type CreditEstimationStatus = (typeof CREDIT_ESTIMATION_STATUSES)[number];

// 3. DEFAULT VALUE
export const DEFAULT_CREDIT_ESTIMATION_STATUS: CreditEstimationStatus = 'sufficient';

// 4. CONSTANT OBJECT
export const CreditEstimationStatuses = {
  SUFFICIENT: 'sufficient' as const,
  LOW: 'low' as const,
  INSUFFICIENT: 'insufficient' as const,
} as const;

// 5. TYPE GUARD (no Zod - simple runtime check)
export function isCreditEstimationStatus(value: unknown): value is CreditEstimationStatus {
  return typeof value === 'string' && CREDIT_ESTIMATION_STATUSES.includes(value as CreditEstimationStatus);
}

// 6. DISPLAY LABELS
export const CREDIT_ESTIMATION_STATUS_LABELS: Record<CreditEstimationStatus, string> = {
  [CreditEstimationStatuses.SUFFICIENT]: 'Sufficient Credits',
  [CreditEstimationStatuses.LOW]: 'Low Credits',
  [CreditEstimationStatuses.INSUFFICIENT]: 'Insufficient Credits',
} as const;

// 7. ZOD SCHEMA (lazy-loaded only when validation is needed)
export async function getCreditEstimationStatusSchema() {
  const { z } = await import('zod');
  return z.enum(CREDIT_ESTIMATION_STATUSES);
}
