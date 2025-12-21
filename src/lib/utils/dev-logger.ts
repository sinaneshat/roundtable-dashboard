/* eslint-disable no-console */
/**
 * Development Logger with Debouncing
 *
 * Strategic debounced logging for identifying:
 * - Store state over-updates
 * - Excessive re-renders
 * - Race conditions
 * - UI mismatches
 *
 * Only active in development.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogEntry = {
  key: string;
  level: LogLevel;
  message: string;
  data?: unknown;
  count: number;
  lastTime: number;
};

// Minimum interval between logs of same key (ms)
const DEBOUNCE_MS = 500;

// Track log entries for debouncing
const logCache = new Map<string, LogEntry>();

// Track update counts per component/action for detecting over-updates
const updateCounts = new Map<string, { count: number; windowStart: number }>();
const UPDATE_WINDOW_MS = 1000; // 1 second window
const EXCESSIVE_UPDATE_THRESHOLD = 10; // More than 10 updates/sec during streaming is suspicious

const isDev = process.env.NODE_ENV === 'development';

/**
 * Log with debouncing - won't log same key more than once per DEBOUNCE_MS
 */
function debouncedLog(
  key: string,
  level: LogLevel,
  message: string,
  data?: unknown,
): void {
  if (!isDev)
    return;

  const now = Date.now();
  const cached = logCache.get(key);

  if (cached && now - cached.lastTime < DEBOUNCE_MS) {
    // Debounced - just increment count
    cached.count++;
    return;
  }

  // Flush previous if had multiple occurrences
  if (cached && cached.count > 1) {
    console[cached.level](
      `[DEV] ${cached.message} (×${cached.count} in ${DEBOUNCE_MS}ms)`,
      cached.data,
    );
  }

  // Log current
  const logFn = console[level];
  if (data !== undefined) {
    logFn(`[DEV:${key}] ${message}`, data);
  } else {
    logFn(`[DEV:${key}] ${message}`);
  }

  // Update cache
  logCache.set(key, {
    key,
    level,
    message,
    data,
    count: 1,
    lastTime: now,
  });
}

/**
 * Track update frequency and warn if excessive
 */
function trackUpdate(key: string): { count: number; isExcessive: boolean } {
  if (!isDev)
    return { count: 0, isExcessive: false };

  const now = Date.now();
  const entry = updateCounts.get(key);

  if (!entry || now - entry.windowStart > UPDATE_WINDOW_MS) {
    // New window
    updateCounts.set(key, { count: 1, windowStart: now });
    return { count: 1, isExcessive: false };
  }

  // Same window - increment
  entry.count++;
  const isExcessive = entry.count > EXCESSIVE_UPDATE_THRESHOLD;

  if (isExcessive && entry.count === EXCESSIVE_UPDATE_THRESHOLD + 1) {
    // Only warn once when threshold crossed
    console.warn(
      `[DEV:EXCESSIVE] ${key} updated ${entry.count} times in ${UPDATE_WINDOW_MS}ms`,
    );
  }

  return { count: entry.count, isExcessive };
}

/**
 * Development logger with namespaced keys
 */
export const devLog = {
  /**
   * Compact debug log - single letter keys, minimal data
   * Format: [X] key=val key2=val2
   */
  d: (tag: string, data: Record<string, unknown>) => {
    const key = `d:${tag}`;
    const { isExcessive } = trackUpdate(key);
    if (isExcessive)
      return;

    // Format as compact key=value pairs
    const pairs = Object.entries(data)
      .map(([k, v]) => {
        if (typeof v === 'boolean')
          return `${k}=${v ? 1 : 0}`;
        if (typeof v === 'number')
          return `${k}=${v}`;
        if (typeof v === 'string')
          return `${k}=${v.length > 10 ? `${v.slice(0, 10)}…` : v}`;
        if (v === null || v === undefined)
          return `${k}=-`;
        return `${k}=?`;
      })
      .join(' ');

    debouncedLog(key, 'debug', pairs);
  },

  // Moderator lifecycle - important events only
  mod: (event: 'start' | 'text' | 'done' | 'add' | 'err', data?: Record<string, unknown>) => {
    const key = `mod:${event}`;
    if (event === 'text') {
      // Text updates are frequent - only track, don't log
      trackUpdate(key);
      return;
    }
    const pairs = data
      ? Object.entries(data).map(([k, v]) => `${k}=${v}`).join(' ')
      : '';
    debouncedLog(key, 'info', pairs);
  },

  // Message sync - track but only log on significant changes
  msg: (event: 'sync' | 'flash', delta: number, extra?: string) => {
    const key = `msg:${event}`;
    const { isExcessive } = trackUpdate(key);
    if (isExcessive)
      return;
    if (delta === 0 && event === 'sync')
      return; // Skip no-op syncs
    debouncedLog(key, 'debug', `Δ${delta}${extra ? ` ${extra}` : ''}`);
  },

  // Render tracking - only warn on excessive
  render: (component: string) => {
    const key = `r:${component}`;
    const { count, isExcessive } = trackUpdate(key);
    if (isExcessive && count % 10 === 0) {
      console.warn(`[!R] ${component} ×${count}/s`);
    }
  },

  // Reset stats
  reset: () => {
    logCache.clear();
    updateCounts.clear();
  },
};

// Export type for testing
export type DevLogger = typeof devLog;
