/**
 * Round Recovery Cron Worker
 *
 * Scheduled Cloudflare Worker that detects and recovers stalled round executions.
 * Self-healing mechanism for robust streaming resumption system.
 *
 * Schedule: Every 60 seconds (configured in wrangler.jsonc)
 *
 * Responsibilities:
 * 1. Find stalled executions (no activity for > 30 seconds)
 * 2. Queue RECOVER_ROUND messages for each
 * 3. Respect max retry limits to prevent infinite loops
 *
 * @see src/services/streaming/background-stream-execution.service.ts - Recovery logic
 * @see src/workers/round-orchestration-queue.ts - RECOVER_ROUND consumer
 */

import { RoundOrchestrationMessageTypes } from '@roundtable/shared/enums';

import type { RecoverRoundQueueMessage } from '@/types/queues';

// ============================================================================
// CONFIGURATION
// ============================================================================

/** Maximum executions to recover per cron run */
const MAX_RECOVERIES_PER_RUN = 10;

// ============================================================================
// CRON HANDLER
// ============================================================================

/**
 * Scheduled handler for round recovery cron
 *
 * Called by Cloudflare's cron trigger at configured intervals.
 * Finds stalled executions and queues recovery messages.
 */
export async function handleRoundRecoveryCron(
  _event: ScheduledEvent,
  env: CloudflareEnv,
  ctx: ExecutionContext,
): Promise<void> {
  // Use waitUntil to ensure recovery completes even if cron times out
  ctx.waitUntil(runRecovery(env));
}

/**
 * Run the recovery process
 * Separated for testability and waitUntil compatibility
 */
async function runRecovery(env: CloudflareEnv): Promise<void> {
  try {
    // Lazy-load to avoid startup CPU limits
    const { findStaleExecutions } = await import('@/services/streaming/background-stream-execution.service');
    const { getDbAsync } = await import('@/db');

    const db = await getDbAsync();

    // Find stale executions
    const staleExecutions = await findStaleExecutions(db, MAX_RECOVERIES_PER_RUN);

    if (staleExecutions.length === 0) {
      return;
    }

    console.info(`[RoundRecoveryCron] Found ${staleExecutions.length} stale executions`);

    // Queue recovery for each
    for (const execution of staleExecutions) {
      try {
        // We need a session token for recovery, but the cron doesn't have one
        // The execution should have the user's info - we'll need to use
        // a service account token or handle this differently
        //
        // For now, we'll skip executions without a way to get a session token
        // In production, you'd want to:
        // 1. Store session token in the execution record
        // 2. Use a service account with elevated permissions
        // 3. Have a separate recovery mechanism for the auth flow

        // Check if we have a stored session token (would need to add this field)
        // For now, queue with a placeholder that the consumer will need to handle
        const message: RecoverRoundQueueMessage = {
          executionId: execution.id,
          messageId: `recover-cron-${execution.id}-${Date.now()}`,
          queuedAt: new Date().toISOString(),
          roundNumber: execution.roundNumber,
          // NOTE: In production, you'd want to store/retrieve the session token
          // This placeholder will need to be handled by the consumer
          sessionToken: 'CRON_RECOVERY_PLACEHOLDER',
          threadId: execution.threadId,
          type: RoundOrchestrationMessageTypes.RECOVER_ROUND,
          userId: execution.userId,
        };

        await env.ROUND_ORCHESTRATION_QUEUE.send(message);

        console.info(`[RoundRecoveryCron] Queued recovery for execution ${execution.id}`);
      } catch (error) {
        console.error(`[RoundRecoveryCron] Failed to queue recovery for ${execution.id}:`, error);
        // Continue with other executions
      }
    }

    console.info(`[RoundRecoveryCron] Completed - queued ${staleExecutions.length} recoveries`);
  } catch (error) {
    console.error('[RoundRecoveryCron] Recovery process failed:', error);
  }
}

/**
 * Export for Cloudflare Workers scheduled handler
 */
export default {
  scheduled: handleRoundRecoveryCron,
};
