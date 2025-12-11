/**
 * Type exports for the application
 *
 * MIGRATION TO ZOD COMPLETE:
 *
 * **For Database Types**, import directly from validation schemas:
 * ```typescript
 * import type {
 *   Payment, Product, Subscription, PaymentMethod,
 *   // Insert/Update variants
 *   PaymentInsert, ProductUpdate, etc.
 * } from '@/db/validation/billing';
 *
 * import type { User } from '@/db/validation/auth';
 * ```
 *
 * **For API Types**, use OpenAPI-enhanced schemas:
 * ```typescript
 * import type { Payment } from '@/api/routes/payments/schema';
 * ```
 *
 * **For Auth Types**, import directly:
 * ```typescript
 * import type { Session, User } from '@/lib/auth/types';
 * ```
 */

// General utility types and schemas - UI component-specific with maximum reusability
export type {
  CustomFetchConfig,
  FormOption,
  FormOptions,
  GeneralFormProps,
  InitialDefaultValues,
  NavItem,
  ServiceConfig,
  TextInputProps,
  WithOptionsProps,
} from './general';
export {
  formOptionSchema,
  formOptionsSchema,
  initialDefaultValuesSchema,
  textInputVariantSchema,
  withOptionsVariantSchema,
} from './general';
