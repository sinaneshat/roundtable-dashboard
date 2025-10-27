/**
 * Debug Logger Utility
 *
 * Provides debounced logging for debugging state changes and re-renders
 * with automatic log limiting to prevent console spam.
 */

/* eslint-disable no-console */

type LogEntry = {
  timestamp: number;
  message: string;
  data?: unknown;
};

class DebugLogger {
  private logs: Map<string, LogEntry[]> = new Map();
  private maxLogsPerKey = 5;
  private debounceTime = 100; // ms
  private timers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Log a message with debouncing and automatic limiting
   *
   * @param key - Unique key for this log type (e.g., 'metadata-update', 'participant-info')
   * @param message - Log message
   * @param data - Optional data to log
   */
  log(key: string, message: string, data?: unknown): void {
    // Skip logging in production
    if (process.env.NODE_ENV === 'production') {
      return;
    }

    // Clear existing timer
    const existingTimer = this.timers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounced timer
    const timer = setTimeout(() => {
      const logs = this.logs.get(key) || [];

      // Check if we've hit the limit
      if (logs.length >= this.maxLogsPerKey) {
        // Show warning that we've hit the limit (only once)
        if (logs.length === this.maxLogsPerKey) {
          console.warn(`[Debug Logger] Max logs reached for key: ${key}. Further logs will be suppressed.`);
          logs.push({
            timestamp: Date.now(),
            message: `[LIMIT REACHED] No more logs will be shown for this key`,
          });
        }
        return;
      }

      // Add log entry
      const logEntry: LogEntry = {
        timestamp: Date.now(),
        message,
        data,
      };
      logs.push(logEntry);
      this.logs.set(key, logs);

      // Format and output log
      const timestamp = new Date(logEntry.timestamp).toISOString().split('T')[1]?.slice(0, -1);
      const logPrefix = `[${timestamp}] [${key}]`;

      if (data !== undefined) {
        console.log(logPrefix, message, data);
      } else {
        console.log(logPrefix, message);
      }

      // Clean up timer
      this.timers.delete(key);
    }, this.debounceTime);

    this.timers.set(key, timer);
  }

  /**
   * Clear logs for a specific key
   */
  clear(key: string): void {
    this.logs.delete(key);
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  /**
   * Clear all logs
   */
  clearAll(): void {
    this.logs.clear();
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }

  /**
   * Get all logs for a specific key
   */
  getLogs(key: string): LogEntry[] {
    return this.logs.get(key) || [];
  }

  /**
   * Get all logs
   */
  getAllLogs(): Map<string, LogEntry[]> {
    return this.logs;
  }
}

// Export singleton instance
export const debugLogger = new DebugLogger();

// Export convenience functions
export const debugLog = {
  metadataUpdate: (message: string, data?: unknown) =>
    debugLogger.log('metadata-update', message, data),

  participantInfo: (message: string, data?: unknown) =>
    debugLogger.log('participant-info', message, data),

  stateChange: (message: string, data?: unknown) =>
    debugLogger.log('state-change', message, data),

  messageRender: (message: string, data?: unknown) =>
    debugLogger.log('message-render', message, data),

  hookLifecycle: (message: string, data?: unknown) =>
    debugLogger.log('hook-lifecycle', message, data),
};
