/**
 * Storage Billing Service
 *
 * Calculates and deducts monthly storage credits for project file attachments.
 * Run during monthly credit refill to charge for ongoing storage.
 */

import { eq, inArray } from 'drizzle-orm';

import type { getDbAsync } from '@/db';
import * as tables from '@/db';

import { deductCreditsForAction, ensureUserCreditRecord } from './credit.service';

const BYTES_PER_MB = 1024 * 1024;
const MB_PER_BILLING_UNIT = 10; // Bill per 10MB

/**
 * Calculate total storage bytes for a user's project attachments
 *
 * @param userId - User ID to calculate storage for
 * @param db - Database connection
 * @returns Total storage in bytes
 */
export async function getUserProjectStorageBytes(
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<number> {
  // Get all projects for this user
  const userProjects = await db.query.chatProject.findMany({
    columns: { id: true },
    where: eq(tables.chatProject.userId, userId),
  });

  if (userProjects.length === 0) {
    return 0;
  }

  const projectIds = userProjects.map(p => p.id);

  // Get all project attachments with upload data
  const attachments = await db.query.projectAttachment.findMany({
    where: inArray(tables.projectAttachment.projectId, projectIds),
    with: {
      upload: {
        columns: { fileSize: true },
      },
    },
  });

  // Sum file sizes
  return attachments.reduce((sum, att) => sum + (att.upload?.fileSize ?? 0), 0);
}

/**
 * Calculate storage credits based on bytes stored
 *
 * @param bytes - Total storage in bytes
 * @returns Credits to charge (10 credits per 10MB, rounded up)
 */
export function calculateStorageCredits(bytes: number): number {
  if (bytes <= 0) {
    return 0;
  }

  const mb = bytes / BYTES_PER_MB;
  const billingUnits = Math.ceil(mb / MB_PER_BILLING_UNIT);

  // 10 credits per 10MB
  return billingUnits * 10;
}

/**
 * Calculate and deduct monthly storage credits for a user
 *
 * Called during monthly credit refill to charge for ongoing storage.
 * Does not fail if user has insufficient credits - just logs warning.
 *
 * @param userId - User ID to bill
 * @param db - Database connection
 * @returns Credits deducted (0 if no storage or billing failed)
 */
export async function calculateAndDeductStorageCredits(
  userId: string,
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<number> {
  try {
    // Ensure user has credit record
    await ensureUserCreditRecord(userId);

    // Get total storage bytes
    const totalBytes = await getUserProjectStorageBytes(userId, db);

    if (totalBytes === 0) {
      return 0;
    }

    // Calculate credits
    const credits = calculateStorageCredits(totalBytes);

    if (credits === 0) {
      return 0;
    }

    // Deduct credits
    const totalMB = Math.round(totalBytes / BYTES_PER_MB);
    await deductCreditsForAction(userId, 'projectStoragePer10MB', {
      description: `Monthly storage: ${totalMB}MB = ${credits} credits`,
    });

    console.error('[Storage Billing] Deducted storage credits', {
      credits,
      totalBytes,
      totalMB,
      userId,
    });

    return credits;
  } catch (error) {
    // Log but don't throw - storage billing is non-critical
    console.error('[Storage Billing] Failed to deduct storage credits', {
      error: error instanceof Error ? error.message : String(error),
      userId,
    });
    return 0;
  }
}
