/**
 * Automated Jobs Enums
 *
 * Status enums for admin-created automated multi-round AI conversations.
 * Lifecycle: pending → running → completed | failed
 */

import { z } from '@hono/zod-openapi';

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
  PENDING: 'pending' as const,
  RUNNING: 'running' as const,
  COMPLETED: 'completed' as const,
  FAILED: 'failed' as const,
} as const;

export const DEFAULT_AUTOMATED_JOB_STATUS = AutomatedJobStatuses.PENDING;
