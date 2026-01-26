import { z } from '@hono/zod-openapi';
import {
  AutomatedJobStatuses,
  AutomatedJobStatusSchema,
} from '@roundtable/shared/enums';

import { DbAutomatedJobMetadataSchema } from '@/db';

// ============================================================================
// REQUEST SCHEMAS
// ============================================================================

/**
 * Create automated job request
 */
export const CreateJobRequestSchema = z.object({
  autoPublish: z.boolean().default(false).openapi({
    description: 'Automatically publish the thread when complete',
    example: false,
  }),
  initialPrompt: z.string().min(10).max(2000).openapi({
    description: 'The initial prompt to start the discussion (10-2000 characters)',
    example: 'What are the pros and cons of remote work?',
  }),
  totalRounds: z.number().int().min(1).max(5).default(3).openapi({
    description: 'Number of rounds for the discussion (1-5)',
    example: 3,
  }),
}).openapi('CreateJobRequest');

export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;

/**
 * Update automated job request
 *
 * Supports:
 * - Retry failed jobs (status: 'running')
 * - Toggle thread visibility (isPublic)
 */
export const UpdateJobRequestSchema = z.object({
  isPublic: z.boolean().optional().openapi({
    description: 'Set thread visibility (only works for completed jobs)',
    example: true,
  }),
  status: z.literal(AutomatedJobStatuses.RUNNING).optional().openapi({
    description: 'Retry a failed job',
    example: AutomatedJobStatuses.RUNNING,
  }),
}).refine(
  data => Object.values(data).some(v => v !== undefined),
  { message: 'At least one field required' },
).openapi('UpdateJobRequest');

export type UpdateJobRequest = z.infer<typeof UpdateJobRequestSchema>;

/**
 * Delete job query params
 */
export const DeleteJobQuerySchema = z.object({
  deleteThread: z.enum(['true', 'false']).optional().openapi({
    description: 'Also delete the associated thread',
    example: 'true',
  }),
}).openapi('DeleteJobQuery');

export type DeleteJobQuery = z.infer<typeof DeleteJobQuerySchema>;

/**
 * Job list query params
 */
export const JobListQuerySchema = z.object({
  cursor: z.string().optional().openapi({
    description: 'Pagination cursor for next page',
    example: 'abc123',
  }),
  limit: z.coerce.number().min(1).max(50).default(20).optional().openapi({
    description: 'Number of results per page (max 50)',
    example: 20,
  }),
  status: AutomatedJobStatusSchema.optional().openapi({
    description: 'Filter by job status',
    example: AutomatedJobStatuses.RUNNING,
  }),
}).openapi('JobListQuery');

export type JobListQuery = z.infer<typeof JobListQuerySchema>;

// ============================================================================
// RESPONSE SCHEMAS
// ============================================================================

/**
 * Job metadata schema - extends DbAutomatedJobMetadataSchema with OpenAPI metadata
 * Single source of truth: /apps/api/src/db/schemas/job-metadata.ts
 */
export const JobMetadataSchema = DbAutomatedJobMetadataSchema.openapi('JobMetadata');

export type JobMetadata = z.infer<typeof JobMetadataSchema>;

/**
 * Single job response
 */
export const JobResponseSchema = z.object({
  autoPublish: z.boolean().openapi({
    description: 'Whether to auto-publish when complete',
  }),
  createdAt: z.string().openapi({
    description: 'ISO timestamp when job was created',
  }),
  currentRound: z.number().openapi({
    description: 'Current round (0-based)',
  }),
  id: z.string().openapi({
    description: 'Job ID (ULID)',
    example: '01HZ123ABC',
  }),
  initialPrompt: z.string().openapi({
    description: 'The initial discussion prompt',
  }),
  isPublic: z.boolean().optional().openapi({
    description: 'Whether the thread is public',
  }),
  metadata: JobMetadataSchema.nullable().openapi({
    description: 'Additional job metadata',
  }),
  selectedModels: z.array(z.string()).nullable().openapi({
    description: 'Model IDs selected for this job',
  }),
  status: AutomatedJobStatusSchema.openapi({
    description: 'Job status',
  }),
  threadId: z.string().nullable().openapi({
    description: 'Associated thread ID (null until started)',
  }),
  threadSlug: z.string().nullable().optional().openapi({
    description: 'Thread slug for navigation',
  }),
  totalRounds: z.number().openapi({
    description: 'Total number of rounds',
  }),
  updatedAt: z.string().openapi({
    description: 'ISO timestamp when job was last updated',
  }),
  userId: z.string().openapi({
    description: 'User who created the job',
  }),
}).openapi('JobResponse');

export type JobResponse = z.infer<typeof JobResponseSchema>;

/**
 * Job list response
 */
export const JobListResponseSchema = z.object({
  hasMore: z.boolean().openapi({
    description: 'Whether there are more results',
  }),
  jobs: z.array(JobResponseSchema).openapi({
    description: 'List of jobs',
  }),
  nextCursor: z.string().nullable().openapi({
    description: 'Cursor for next page',
  }),
  total: z.number().openapi({
    description: 'Total number of jobs matching filter',
  }),
}).openapi('JobListResponse');

export type JobListResponse = z.infer<typeof JobListResponseSchema>;

/**
 * Job creation response (includes queue status)
 */
export const JobCreatedResponseSchema = z.object({
  job: JobResponseSchema,
  queued: z.boolean().openapi({
    description: 'Whether the job was successfully queued',
  }),
}).openapi('JobCreatedResponse');

export type JobCreatedResponse = z.infer<typeof JobCreatedResponseSchema>;

/**
 * Delete job response
 */
export const DeleteJobResponseSchema = z.object({
  deleted: z.boolean().openapi({
    description: 'Whether the job was deleted',
  }),
  threadDeleted: z.boolean().optional().openapi({
    description: 'Whether the associated thread was also deleted',
  }),
}).openapi('DeleteJobResponse');

export type DeleteJobResponse = z.infer<typeof DeleteJobResponseSchema>;
