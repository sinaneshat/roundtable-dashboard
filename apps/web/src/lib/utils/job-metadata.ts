import type { AutomatedJob } from '@/services/api';

/**
 * Type-safe accessor for job error message from metadata
 */
export function getJobErrorMessage(job: AutomatedJob): string | undefined {
  return job.metadata?.errorMessage;
}

/**
 * Type-safe accessor for job started timestamp from metadata
 */
export function getJobStartedAt(job: AutomatedJob): string | undefined {
  return job.metadata?.startedAt;
}

/**
 * Type-safe accessor for job completed timestamp from metadata
 */
export function getJobCompletedAt(job: AutomatedJob): string | undefined {
  return job.metadata?.completedAt;
}
