/**
 * Logger Category Styles
 *
 * Console styles for backend log categories.
 * Uses same pattern as RLOG_CATEGORY_STYLES in enums/logging.ts
 */

import type { BackendLogCategory } from './types';

// ============================================================================
// BACKEND CATEGORY STYLES
// ============================================================================

/**
 * Console styles for backend log categories
 * Uses same pattern as RLOG_CATEGORY_STYLES in enums/logging.ts
 */
export const BACKEND_CATEGORY_STYLES: Record<BackendLogCategory, string> = {
  AI: 'color: #4CAF50; font-weight: bold', // Green - AI operations
  AUDIT: 'color: #9C27B0; font-weight: bold', // Purple - security audit
  AUTH: 'color: #673AB7; font-weight: bold', // Deep purple - authentication
  BILLING: 'color: #009688; font-weight: bold', // Teal - billing/payments
  CACHE: 'color: #2196F3; font-weight: bold', // Blue - caching
  CRON: 'color: #FF5722; font-weight: bold', // Deep orange - cron jobs
  DB: 'color: #3F51B5; font-weight: bold', // Indigo - database
  HTTP: 'color: #795548; font-weight: bold', // Brown - HTTP requests
  MCP: 'color: #8BC34A; font-weight: bold', // Light green - MCP
  PDF: 'color: #E91E63; font-weight: bold', // Pink - document processing
  QUEUE: 'color: #FF9800; font-weight: bold', // Orange - queue jobs
  UPLOAD: 'color: #00BCD4; font-weight: bold', // Cyan - file uploads
} as const;

// ============================================================================
// LOG ACTION SYMBOLS
// ============================================================================

/**
 * Icons/symbols for log actions (optional enhancement)
 */
export const LOG_ACTION_SYMBOLS: Record<string, string> = {
  done: '\u2713', // checkmark
  error: '\u2717', // x mark
  init: '\u25D0', // half circle
  retry: '\u21BB', // clockwise arrow
  skip: '\u2298', // circled division slash
  start: '\u25B6', // play arrow
  warn: '\u26A0', // warning sign
} as const;
