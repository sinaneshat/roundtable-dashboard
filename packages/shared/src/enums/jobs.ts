/**
 * Automated Jobs Enums
 *
 * Status enums for admin-created automated multi-round AI conversations.
 * Lifecycle: pending → running → completed | failed
 */

import { z } from '@hono/zod-openapi';

import type { BadgeVariant } from './ui';
import { BadgeVariants } from './ui';

// ============================================================================
// AUTOMATED JOB STATUS
// ============================================================================

export const AUTOMATED_JOB_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;

export const AutomatedJobStatusSchema = z.enum(AUTOMATED_JOB_STATUSES).openapi({
  description: 'Automated job execution status',
  example: 'running',
});

export type AutomatedJobStatus = z.infer<typeof AutomatedJobStatusSchema>;

export const AutomatedJobStatuses = {
  COMPLETED: 'completed' as const,
  FAILED: 'failed' as const,
  PENDING: 'pending' as const,
  RUNNING: 'running' as const,
} as const;

export const DEFAULT_AUTOMATED_JOB_STATUS = AutomatedJobStatuses.PENDING;

// ============================================================================
// JOB STATUS TO BADGE VARIANT MAPPING
// ============================================================================

export const AUTOMATED_JOB_STATUS_TO_BADGE_VARIANT: Record<AutomatedJobStatus, BadgeVariant> = {
  completed: BadgeVariants.SECONDARY,
  failed: BadgeVariants.DESTRUCTIVE,
  pending: BadgeVariants.OUTLINE,
  running: BadgeVariants.DEFAULT,
};

export function getJobStatusBadgeVariant(status: AutomatedJobStatus): BadgeVariant {
  return AUTOMATED_JOB_STATUS_TO_BADGE_VARIANT[status];
}
