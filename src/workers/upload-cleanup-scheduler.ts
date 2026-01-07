/**
 * Upload Cleanup Scheduler - Durable Object
 *
 * Schedules automatic cleanup of orphaned uploads using DO Alarms.
 * When a file is uploaded, an alarm is set for 15 minutes later.
 * When the alarm fires, it checks if the upload is attached to any
 * message/thread/project. If orphaned, it gets deleted.
 *
 * Architecture:
 * - One DO instance per upload (keyed by uploadId)
 * - Uses SQLite storage for persistence across restarts
 * - Alarms survive worker restarts and failovers
 *
 * Following established patterns from:
 * - src/api/services/title-generator.service.ts (service layer usage)
 * - docs/backend-patterns.md (Drizzle ORM patterns)
 *
 * @see src/api/services/upload-orphan-check.service.ts - Business logic
 */

import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';

import {
  checkUploadOrphaned,
  createDrizzleFromD1,
  deleteFromR2,
  deleteUploadRecord,
} from '@/api/services/uploads';

// ============================================================================
// REQUEST SCHEMAS (Zod validation for type-safe request bodies)
// ============================================================================

const ScheduleCleanupRequestSchema = z.object({
  uploadId: z.string().min(1),
  userId: z.string().min(1),
  r2Key: z.string().min(1),
});

const CancelCleanupRequestSchema = z.object({
  uploadId: z.string().min(1),
});

// Cleanup delay in milliseconds (15 minutes)
const CLEANUP_DELAY_MS = 15 * 60 * 1000;

// Grace period buffer for race condition protection (30 seconds)
// Ensures attachment transactions have time to commit before orphan check
const GRACE_PERIOD_MS = 30 * 1000;

// Maximum retries for D1 queries
const MAX_D1_RETRIES = 2;

type UploadCleanupState = {
  uploadId: string;
  userId: string;
  r2Key: string;
  scheduledAt: number;
  createdAt: number;
};

/**
 * UploadCleanupScheduler Durable Object
 *
 * Each instance manages the cleanup schedule for a single upload.
 * Uses DO Alarms for guaranteed execution after the delay period.
 *
 * Database Access:
 * - Uses createDrizzleFromD1() from upload-orphan-check.service.ts
 * - Follows established patterns from title-generator.service.ts
 */
export class UploadCleanupScheduler extends DurableObject<CloudflareEnv> {
  private sql: SqlStorage;
  private db: ReturnType<typeof createDrizzleFromD1>;

  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // Initialize Drizzle ORM instance for D1 access
    this.db = createDrizzleFromD1(env.DB);

    // Initialize SQLite table on first access
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS cleanup_state (
        upload_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        r2_key TEXT NOT NULL,
        scheduled_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  }

  /**
   * Schedule cleanup for an upload
   * Called when a file is uploaded to R2
   */
  async scheduleCleanup(uploadId: string, userId: string, r2Key: string): Promise<{ scheduled: boolean; alarmTime: number }> {
    const now = Date.now();
    const alarmTime = now + CLEANUP_DELAY_MS;

    // Store the upload state
    this.sql.exec(
      `INSERT OR REPLACE INTO cleanup_state (upload_id, user_id, r2_key, scheduled_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      uploadId,
      userId,
      r2Key,
      alarmTime,
      now,
    );

    // Set the alarm for cleanup check
    await this.ctx.storage.setAlarm(alarmTime);

    return { scheduled: true, alarmTime };
  }

  /**
   * Cancel scheduled cleanup (upload was attached to something)
   * Called when upload is associated with a message/thread/project
   */
  async cancelCleanup(uploadId: string): Promise<{ cancelled: boolean }> {
    // Remove from state
    this.sql.exec('DELETE FROM cleanup_state WHERE upload_id = ?', uploadId);

    // Check if there are any remaining uploads to clean
    const remaining = this.sql.exec('SELECT COUNT(*) as count FROM cleanup_state').one();
    if (remaining && (remaining.count as number) === 0) {
      // No more uploads to track, delete the alarm
      await this.ctx.storage.deleteAlarm();
    }

    return { cancelled: true };
  }

  /**
   * Get current cleanup state
   */
  async getState(uploadId: string): Promise<UploadCleanupState | null> {
    const row = this.sql.exec(
      'SELECT upload_id, user_id, r2_key, scheduled_at, created_at FROM cleanup_state WHERE upload_id = ?',
      uploadId,
    ).one();

    if (!row)
      return null;

    return {
      uploadId: row.upload_id as string,
      userId: row.user_id as string,
      r2Key: row.r2_key as string,
      scheduledAt: row.scheduled_at as number,
      createdAt: row.created_at as number,
    };
  }

  /**
   * Alarm handler - triggered when cleanup delay expires
   * Uses waitUntil to ensure cleanup completes even if DO hibernates
   */
  async alarm(): Promise<void> {
    // Use waitUntil to ensure cleanup work completes
    this.ctx.waitUntil(this.processCleanups());
  }

  /**
   * Process all due cleanups
   * Separated from alarm() for waitUntil support
   */
  private async processCleanups(): Promise<void> {
    const now = Date.now();

    // Get all uploads that are due for cleanup (with grace period buffer)
    // The grace period prevents race conditions where attachment is being committed
    const dueUploads = this.sql.exec(
      'SELECT upload_id, user_id, r2_key, scheduled_at FROM cleanup_state WHERE scheduled_at <= ?',
      now,
    ).toArray();

    for (const row of dueUploads) {
      const uploadId = row.upload_id as string;
      const r2Key = row.r2_key as string;
      const scheduledAt = row.scheduled_at as number;

      // Additional grace period check - if scheduled time + grace period hasn't passed,
      // reschedule for later to allow any in-flight attachment operations to complete
      if (now < scheduledAt + GRACE_PERIOD_MS) {
        const newAlarmTime = scheduledAt + GRACE_PERIOD_MS;
        this.sql.exec(
          'UPDATE cleanup_state SET scheduled_at = ? WHERE upload_id = ?',
          newAlarmTime,
          uploadId,
        );
        continue;
      }

      try {
        // Check if upload is orphaned with retry logic
        const isOrphaned = await this.checkIfOrphanedWithRetry(uploadId);

        if (isOrphaned === null) {
          // D1 query failed after retries - reschedule instead of deleting
          const retryTime = now + CLEANUP_DELAY_MS;
          this.sql.exec(
            'UPDATE cleanup_state SET scheduled_at = ? WHERE upload_id = ?',
            retryTime,
            uploadId,
          );
          continue;
        }

        if (isOrphaned) {
          // Delete from R2
          await this.deleteR2File(r2Key);

          // Delete from database
          await this.deleteFromDatabase(uploadId);
        }

        // Remove from cleanup state only on successful check
        this.sql.exec('DELETE FROM cleanup_state WHERE upload_id = ?', uploadId);
      } catch (error) {
        // Structured logging for Cloudflare Workers Logs indexing
        console.error({
          log_type: 'alarm_error',
          timestamp: new Date().toISOString(),
          durable_object: 'UploadCleanupScheduler',
          operation: 'processCleanups',
          upload_id: uploadId,
          r2_key: r2Key,
          error_message: error instanceof Error ? error.message : String(error),
          error_stack: error instanceof Error ? error.stack : undefined,
        });
        // Don't remove from state - will be retried on next alarm
      }
    }

    // Check if there are more uploads scheduled for later
    const nextAlarm = this.sql.exec(
      'SELECT MIN(scheduled_at) as next_time FROM cleanup_state',
    ).one();

    if (nextAlarm && nextAlarm.next_time) {
      // Schedule next alarm
      await this.ctx.storage.setAlarm(nextAlarm.next_time as number);
    }
  }

  /**
   * Check if upload is orphaned with retry logic
   * Returns null if all retries fail (caller should reschedule)
   *
   * Uses checkUploadOrphaned from upload-orphan-check.service.ts
   * (Drizzle ORM instead of raw D1 queries)
   */
  private async checkIfOrphanedWithRetry(uploadId: string): Promise<boolean | null> {
    for (let attempt = 0; attempt <= MAX_D1_RETRIES; attempt++) {
      try {
        // Use service function with Drizzle ORM
        const result = await checkUploadOrphaned(uploadId, this.db);
        return result.isOrphaned;
      } catch (error) {
        console.error({
          log_type: 'alarm_retry',
          timestamp: new Date().toISOString(),
          durable_object: 'UploadCleanupScheduler',
          operation: 'checkIfOrphanedWithRetry',
          upload_id: uploadId,
          attempt: attempt + 1,
          max_attempts: MAX_D1_RETRIES + 1,
          error_message: error instanceof Error ? error.message : String(error),
        });
        if (attempt < MAX_D1_RETRIES) {
          // Exponential backoff: 100ms, 200ms, 400ms...
          await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
        }
      }
    }
    // All retries failed - return null to signal caller should reschedule
    return null;
  }

  /**
   * Delete file from R2 storage
   * Delegates to service function for consistent error handling
   */
  private async deleteR2File(r2Key: string): Promise<void> {
    await deleteFromR2(this.env.UPLOADS_R2_BUCKET, r2Key);
  }

  /**
   * Delete upload record from database
   * Uses Drizzle ORM via service function
   */
  private async deleteFromDatabase(uploadId: string): Promise<void> {
    await deleteUploadRecord(uploadId, this.db);
  }

  /**
   * HTTP fetch handler for the Durable Object
   * Allows external calls to schedule/cancel cleanup
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === 'POST' && path === '/schedule') {
        // ✅ TYPE-SAFE: Use Zod schema validation
        const parseResult = ScheduleCleanupRequestSchema.safeParse(await request.json());
        if (!parseResult.success) {
          return new Response('Invalid request body', { status: 400 });
        }
        const { uploadId, userId, r2Key } = parseResult.data;
        const result = await this.scheduleCleanup(uploadId, userId, r2Key);
        return Response.json(result);
      }

      if (request.method === 'POST' && path === '/cancel') {
        // ✅ TYPE-SAFE: Use Zod schema validation
        const parseResult = CancelCleanupRequestSchema.safeParse(await request.json());
        if (!parseResult.success) {
          return new Response('Invalid request body', { status: 400 });
        }
        const result = await this.cancelCleanup(parseResult.data.uploadId);
        return Response.json(result);
      }

      if (request.method === 'GET' && path.startsWith('/state/')) {
        const uploadId = path.replace('/state/', '');
        const state = await this.getState(uploadId);
        return Response.json({ state });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error({
        log_type: 'do_fetch_error',
        timestamp: new Date().toISOString(),
        durable_object: 'UploadCleanupScheduler',
        operation: 'fetch',
        path,
        method: request.method,
        error_message: error instanceof Error ? error.message : String(error),
        error_stack: error instanceof Error ? error.stack : undefined,
      });
      return new Response(
        JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }
}
