/**
 * Storage purpose type definition
 */

import { z } from 'zod';

export const storagePurposeSchema = z.enum([
  'user_avatar',
  'company_logo',
  'company_banner',
  'document',
  'temp',
]);

export type StoragePurpose = z.infer<typeof storagePurposeSchema>;
