/**
 * Web App Enums
 *
 * Barrel exports for all web-app-specific enums.
 * For shared enums across apps, import from '@roundtable/shared'.
 *
 * @example
 * ```ts
 * import {
 *   StorageTypes,
 *   type StorageType,
 * } from '@/lib/enums';
 * ```
 */

// Analytics enums
export {
  DEFAULT_PROJECT_ANALYTICS_EVENT_TYPE,
  getProjectAnalyticsEventTypeSchema,
  isProjectAnalyticsEventType,
  PROJECT_ANALYTICS_EVENT_TYPES,
  type ProjectAnalyticsEventType,
  ProjectAnalyticsEventTypes,
} from './analytics';

// Billing UI enums
export {
  CREDIT_ESTIMATION_STATUS_LABELS,
  CREDIT_ESTIMATION_STATUSES,
  type CreditEstimationStatus,
  CreditEstimationStatuses,
  DEFAULT_CREDIT_ESTIMATION_STATUS,
  getCreditEstimationStatusSchema,
  isCreditEstimationStatus,
} from './billing-ui';

// Storage enums
export {
  DEFAULT_STORAGE_TYPE,
  getStorageTypeSchema,
  isStorageType,
  STORAGE_TYPE_LABELS,
  STORAGE_TYPES,
  type StorageType,
  StorageTypes,
} from './storage';

// UI Styles enums
export {
  BORDER_RADIUS_CLASS_LABELS,
  BORDER_RADIUS_CLASSES,
  BORDER_RADIUS_PIXEL_MAP,
  type BorderRadiusClass,
  BorderRadiusClasses,
  DEFAULT_BORDER_RADIUS_CLASS,
  getBorderRadiusClassSchema,
  isBorderRadiusClass,
} from './ui-styles';
