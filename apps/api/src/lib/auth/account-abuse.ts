/**
 * Account Abuse Prevention Utilities
 *
 * Prevents free round abuse by tracking hashed emails of deleted accounts.
 * GDPR compliant - stores SHA-256 hash, not raw email.
 */

import { ACCOUNT_ABUSE_CONFIG } from '@roundtable/shared';
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { deletedAccountAudit } from '@/db/tables/deleted-account-audit';

/**
 * Hash email using SHA-256 for GDPR-compliant storage
 */
export async function hashEmail(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if email is blocked from signup due to repeated deletions
 */
export async function isEmailBlockedFromSignup(email: string): Promise<boolean> {
  const emailHash = await hashEmail(email);

  const existing = await db
    .select()
    .from(deletedAccountAudit)
    .where(eq(deletedAccountAudit.emailHash, emailHash));

  const record = existing[0];
  if (!record) {
    return false;
  }

  return record.deletionCount >= ACCOUNT_ABUSE_CONFIG.MAX_DELETION_COUNT;
}

/**
 * Record account deletion - insert new record or increment existing count
 */
export async function recordAccountDeletion(email: string): Promise<void> {
  const emailHash = await hashEmail(email);
  const now = new Date();

  const existing = await db
    .select()
    .from(deletedAccountAudit)
    .where(eq(deletedAccountAudit.emailHash, emailHash));

  const record = existing[0];
  if (!record) {
    await db.insert(deletedAccountAudit).values({
      deletionCount: 1,
      emailHash,
      firstDeletedAt: now,
      id: crypto.randomUUID(),
      lastDeletedAt: now,
    });
  } else {
    await db
      .update(deletedAccountAudit)
      .set({
        deletionCount: record.deletionCount + 1,
        lastDeletedAt: now,
      })
      .where(eq(deletedAccountAudit.emailHash, emailHash));
  }
}
