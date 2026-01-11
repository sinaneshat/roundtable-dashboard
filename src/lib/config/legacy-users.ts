/**
 * Legacy Users Configuration
 *
 * Paid users from the legacy platform who should receive
 * 1 month of Pro plan upon signing up to the new platform.
 *
 * These emails are matched case-insensitively during signup.
 * Once activated, users get Pro plan with 100K credits for 1 month.
 */

export const LEGACY_PAID_USER_EMAILS: readonly string[] = [
  'anita.solati@gmail.com',
  'steven.mocarski@gmail.com',
  'behnia1352@gmail.com',
  'sirmohammadnouri@gmail.com',
  'bazizi@gmail.com',
  'davej.se@outlook.com',
  'etajer@gmail.com',
  'sh.golazad@gmail.com',
  'maryam.fahimnejad@gmail.com',
  'dr.farid.mohamadi.derm@gmail.com',
  'nahalghorbi@yahoo.com',
  'omranisadeq10@gmail.com',
  'mehrabadgroup@gmail.com',
] as const;

// Set for O(1) lookup - normalized to lowercase
const LEGACY_EMAIL_SET = new Set(
  LEGACY_PAID_USER_EMAILS.map(email => email.toLowerCase()),
);

/**
 * Check if an email belongs to a legacy paid user
 */
export function isLegacyPaidUser(email: string): boolean {
  return LEGACY_EMAIL_SET.has(email.toLowerCase());
}
