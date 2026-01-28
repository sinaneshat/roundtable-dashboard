/**
 * Backend Logger
 *
 * Unified logger instance for the API backend.
 * Uses the shared factory with backend-specific output function.
 *
 * @example
 * import { log } from '@/lib/logger';
 *
 * log.pdf('init', 'Initializing PDF.js...');
 * log.pdf('done', 'PDF.js ready', { took: '45ms' });
 * log.audit('download', { userId: 'abc', fileId: 'xyz' });
 * log.error('Something failed', error);
 */

import { createLogger } from '@roundtable/shared/lib/logger';

import { backendOutput } from './output';

/**
 * Backend logger instance
 */
export const log = createLogger({
  isDev: process.env.NODE_ENV === 'development' || process.env.WEBAPP_ENV === 'local',
  output: backendOutput,
});

// Re-export types for convenience
export type { LogData, Logger } from '@roundtable/shared/lib/logger';
