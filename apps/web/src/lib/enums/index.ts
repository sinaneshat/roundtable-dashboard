/**
 * Web App Enums
 *
 * Barrel exports for all web-app-specific enums.
 * For shared enums across apps, import from '@roundtable/shared'.
 *
 * @example
 * ```ts
 * import {
 *   ChatAlertVariants,
 *   type ChatAlertVariant,
 *   StorageTypes,
 *   type StorageType,
 * } from '@/lib/enums';
 * ```
 */

// Billing UI enums
export {
  CREDIT_ESTIMATION_STATUS_LABELS,
  CREDIT_ESTIMATION_STATUSES,
  type CreditEstimationStatus,
  CreditEstimationStatuses,
  CreditEstimationStatusSchema,
  DEFAULT_CREDIT_ESTIMATION_STATUS,
  isCreditEstimationStatus,
} from './billing-ui';

// Chat UI enums
export {
  CHAT_ALERT_VARIANT_LABELS,
  CHAT_ALERT_VARIANTS,
  type ChatAlertVariant,
  ChatAlertVariants,
  ChatAlertVariantSchema,
  DEFAULT_CHAT_ALERT_VARIANT,
  isChatAlertVariant,
} from './chat-ui';

// Storage enums
export {
  DEFAULT_STORAGE_TYPE,
  isStorageType,
  STORAGE_TYPE_LABELS,
  STORAGE_TYPES,
  type StorageType,
  StorageTypes,
  StorageTypeSchema,
} from './storage';

// UI Styles enums
export {
  BORDER_RADIUS_CLASS_LABELS,
  BORDER_RADIUS_CLASSES,
  BORDER_RADIUS_PIXEL_MAP,
  type BorderRadiusClass,
  BorderRadiusClasses,
  BorderRadiusClassSchema,
  DEFAULT_BORDER_RADIUS_CLASS,
  isBorderRadiusClass,
} from './ui-styles';
