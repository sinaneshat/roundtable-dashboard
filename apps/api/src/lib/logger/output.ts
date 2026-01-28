/**
 * Backend Logger Output
 *
 * Environment-aware output function for the backend logger.
 * - Dev: Colorful console.log (not console.error!)
 * - Prod: Structured JSON via console.log (only console.error for actual errors)
 */

import { RLOG_CATEGORY_STYLES, RlogCategories } from '@roundtable/shared/enums';
import type { ConsoleLogLevel, LogCategory, LogData } from '@roundtable/shared/lib/logger';
import { BACKEND_CATEGORY_STYLES, buildLogMessage } from '@roundtable/shared/lib/logger';

const IS_DEV = process.env.NODE_ENV === 'development' || process.env.WEBAPP_ENV === 'local';

/**
 * Get style for a category
 */
function getCategoryStyle(category: LogCategory): string {
  // Check rlog categories first
  if (category in RlogCategories) {
    return RLOG_CATEGORY_STYLES[category as keyof typeof RLOG_CATEGORY_STYLES];
  }
  // Then backend categories
  if (category in BACKEND_CATEGORY_STYLES) {
    return BACKEND_CATEGORY_STYLES[category as keyof typeof BACKEND_CATEGORY_STYLES];
  }
  // Default style
  return 'color: #607D8B; font-weight: bold';
}

/**
 * Backend output function
 * - Dev: Colorful formatted logs via console.log
 * - Prod: Structured JSON via console.log (NOT console.error!)
 */
export function backendOutput(
  level: ConsoleLogLevel,
  category: LogCategory,
  action: string | null,
  message: string,
  data?: LogData | Error,
): void {
  const logData = data instanceof Error
    ? { errorMessage: data.message, errorName: data.name }
    : data;

  if (IS_DEV) {
    // Dev: colorful console output
    const style = getCategoryStyle(category);
    const formattedMsg = buildLogMessage(String(category), action, message, logData);

    // Use correct console method based on level
    switch (level) {
      case 'debug':
        // eslint-disable-next-line no-console
        console.debug(`%c${formattedMsg}`, style);
        break;
      case 'warn':
        console.warn(`%c${formattedMsg}`, style);
        break;
      case 'error':

        console.error(`%c${formattedMsg}`, style);
        break;
      default:
        // eslint-disable-next-line no-console
        console.log(`%c${formattedMsg}`, style);
    }
  } else {
    // Prod: structured JSON via console.log (avoids ERROR prefix)
    const entry = {
      category,
      level,
      message,
      timestamp: new Date().toISOString(),
      ...(action && { action }),
      ...logData,
    };

    // Only use console.error for actual errors in production
    if (level === 'error') {
      console.error(JSON.stringify(entry));
    } else {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(entry));
    }
  }
}
