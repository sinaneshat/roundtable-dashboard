import type { DebugData, DevLogLevel, RlogCategory, RlogStreamAction } from '@roundtable/shared';
import { DevLogLevels, RLOG_CATEGORY_STYLES, RlogCategories } from '@roundtable/shared';
import { WebAppEnvs } from '@roundtable/shared/enums';
// Shared logger formatting utilities from the shared package
// Note: Local formatDebugValue uses 10 char truncation vs 20 chars in shared
import { formatLogData as sharedFormatLogData } from '@roundtable/shared/lib/logger';

import { getWebappEnv } from '@/lib/config/base-urls';

import { safeStorageRemove, safeStorageSet } from './safe-storage';

// Re-export shared utility for external use (verifies shared package is accessible)
export { sharedFormatLogData };

type LogEntry = {
  key: string;
  level: DevLogLevel;
  message: string;
  data?: string;
  count: number;
  lastTime: number;
};

type UpdateTracker = {
  count: number;
  windowStart: number;
};

const DEBOUNCE_MS = 500;
const UPDATE_WINDOW_MS = 1000;
const EXCESSIVE_UPDATE_THRESHOLD = 10;

// ============================================================================
// TIERED LOGGING SYSTEM
// Goal: Reduce console noise from 200+ logs to <50 per round
// ============================================================================

const LOG_DEDUPE_WINDOW_MS = 3000; // Collapse logs within 3 second window

// ============================================================================
// DEBOUNCE MECHANISM - Reduces rapid repeated logs
// ============================================================================
const debouncedLogs = new Map<string, { lastTime: number; count: number; lastMessage: string }>();
const RAPID_LOG_DEBOUNCE_MS = 500;

/**
 * Check if a log should fire based on debounce timing.
 * Returns { shouldLog: true, suppressedCount: N } if log should fire.
 * Returns { shouldLog: false } if log is suppressed.
 *
 * When shouldLog is true after suppression, caller can append "(+N suppressed)" to message.
 */
function shouldLogDebounced(key: string, message: string): { shouldLog: boolean; suppressedCount: number } {
  const now = Date.now();
  const state = debouncedLogs.get(key);

  if (!state || now - state.lastTime >= RAPID_LOG_DEBOUNCE_MS) {
    // First log or debounce window expired - log immediately
    const suppressedCount = state?.count ?? 0;
    debouncedLogs.set(key, { lastTime: now, count: 0, lastMessage: message });
    return { shouldLog: true, suppressedCount };
  }

  // Within debounce window - suppress and count
  state.count++;
  state.lastMessage = message;
  return { shouldLog: false, suppressedCount: 0 };
}

type DedupeEntry = {
  count: number;
  firstTime: number;
  lastTime: number;
  lastArgs: string;
  reported: boolean;
};

// Track previous values for value-change detection (FLOW tier)
const prevValuesMap = new Map<string, string>();

const dedupeMap = new Map<string, DedupeEntry>();
const throttleMap = new Map<string, number>(); // category -> lastLogTime

// ============================================================================
// TIER DEFINITIONS
// ============================================================================

// TIER 1: CRITICAL - Always log immediately (never dedupe)
// These are essential for debugging race conditions, state issues, errors
const CRITICAL_CATEGORIES = new Set([
  'phase-transition',
  'round-complete',
  'pcount-mismatch',
  'race-detected',
  'round-ref-lag',
  'state-desync',
  'stuck',
  'error',
  'handoff',
  'submit',
  'frame',
  'race',
]);

// TIER 2: FLOW - Log on state changes only (dedupe by value)
// Important for understanding flow, but only when values change
const FLOW_CATEGORIES = new Set([
  'phase',
  'gate',
  'trigger',
  'changelog',
]);

// TIER 3: DEBUG - Heavily throttled (2000ms minimum between same logs)
// Useful for debugging but generates too much noise at full speed
const DEBUG_CATEGORIES = new Set([
  'stream',
  'moderator',
  'init',
  'msg',
  'sync',
  'presearch',
]);

// TIER 4: SILENT - Don't log unless explicitly enabled via localStorage
// High-frequency, low-value logs that obscure debugging
const SILENT_CATEGORIES = new Set([
  'chunk',
  'render-state',
  'query-render',
  'stream-append',
]);

// Throttle interval for DEBUG tier (2 seconds)
const DEBUG_THROTTLE_MS = 2000;

// ============================================================================
// VERBOSE FLAGS - Enable for deep debugging specific subsystems
// ============================================================================

/**
 * When true, logs ALL resume-related events including expected disabled states.
 * Default false - only logs state changes, actual resumptions, and errors.
 * Enable via: rlog.setVerboseResume(true) or localStorage.set('rlog_verbose_resume', '1')
 */
let VERBOSE_RESUME = typeof localStorage !== 'undefined'
  ? localStorage.getItem('rlog_verbose_resume') === '1'
  : false;

export function setVerboseResume(enabled: boolean): void {
  VERBOSE_RESUME = enabled;
  if (typeof localStorage !== 'undefined') {
    if (enabled) {
      localStorage.setItem('rlog_verbose_resume', '1');
    } else {
      localStorage.removeItem('rlog_verbose_resume');
    }
  }
}

export function isVerboseResumeEnabled(): boolean {
  return VERBOSE_RESUME;
}

/**
 * Enable verbose logging for a specific category (SILENT tier).
 * Useful for debugging specific subsystems without enabling all logs.
 *
 * @example
 * enableVerboseCategory('chunk'); // Enable chunk logging
 * disableVerboseCategory('chunk'); // Disable chunk logging
 */
export function enableVerboseCategory(category: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`rlog_verbose_${category}`, '1');
    // eslint-disable-next-line no-console
    console.log(`%c[RLOG] Verbose logging enabled for: ${category}`, 'color: #4CAF50');
  }
}

export function disableVerboseCategory(category: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(`rlog_verbose_${category}`);
    // eslint-disable-next-line no-console
    console.log(`%c[RLOG] Verbose logging disabled for: ${category}`, 'color: #FF5722');
  }
}

function isVerboseCategoryEnabled(category: string): boolean {
  if (typeof localStorage === 'undefined') {
    return false;
  }
  return localStorage.getItem(`rlog_verbose_${category}`) === '1';
}

function shouldLogWithDedupe(category: string, message: string, key?: string): { shouldLog: boolean; suffix?: string } {
  // TIER 1: Critical - always log immediately
  if (CRITICAL_CATEGORIES.has(category)) {
    return { shouldLog: true };
  }

  // TIER 4: Silent - check localStorage flag before logging
  if (SILENT_CATEGORIES.has(category)) {
    if (!isVerboseCategoryEnabled(category)) {
      return { shouldLog: false };
    }
  }

  // Skip logs with no debugging value
  if (message.includes('APPEND') || message.includes('SKIP:')) {
    return { shouldLog: false };
  }

  const now = Date.now();
  const dedupeKey = `${category}:${message.slice(0, 60)}`; // Shorter key for faster lookup

  // TIER 2: Flow - dedupe by value change only
  if (FLOW_CATEGORIES.has(category) && key) {
    const valueKey = `${category}:${key}`;
    const prevValue = prevValuesMap.get(valueKey);
    if (prevValue === message) {
      return { shouldLog: false };
    }
    prevValuesMap.set(valueKey, message);
    return { shouldLog: true };
  }

  // TIER 3: Debug - heavy throttling (2000ms)
  if (DEBUG_CATEGORIES.has(category)) {
    const lastLog = throttleMap.get(category) ?? 0;
    if (now - lastLog < DEBUG_THROTTLE_MS) {
      return { shouldLog: false };
    }
    throttleMap.set(category, now);
    return { shouldLog: true };
  }

  // Standard deduplication for remaining categories
  const entry = dedupeMap.get(dedupeKey);
  if (!entry || now - entry.lastTime > LOG_DEDUPE_WINDOW_MS) {
    dedupeMap.set(dedupeKey, { count: 1, firstTime: now, lastArgs: message, lastTime: now, reported: false });
    return { shouldLog: true };
  }

  entry.count++;
  entry.lastTime = now;
  return { shouldLog: false };
}

// Periodic cleanup of old entries (runs every 10 seconds)
if (typeof window !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    const staleThreshold = LOG_DEDUPE_WINDOW_MS * 5;

    for (const [key, entry] of dedupeMap.entries()) {
      if (now - entry.lastTime > staleThreshold) {
        dedupeMap.delete(key);
      }
    }

    // Also clean up debounced logs map (stale after 30 seconds)
    const debounceStaleThreshold = 30000;
    for (const [key, entry] of debouncedLogs.entries()) {
      if (now - entry.lastTime > debounceStaleThreshold) {
        debouncedLogs.delete(key);
      }
    }
  }, 10000);
}

const logCache = new Map<string, LogEntry>();
const updateCounts = new Map<string, UpdateTracker>();

// Enable client-side logging in development AND preview environments (not production)
// Uses hostname-based detection for reliable env detection on client
function getIsDev(): boolean {
  const env = getWebappEnv();
  return env === WebAppEnvs.LOCAL || env === WebAppEnvs.PREVIEW;
}

const isDev = getIsDev();

/* eslint-disable no-console */
function getConsoleMethod(level: DevLogLevel): typeof console.debug {
  const consoleMethodMap: Record<DevLogLevel, typeof console.debug> = {
    [DevLogLevels.DEBUG]: console.debug.bind(console),
    [DevLogLevels.ERROR]: console.error.bind(console),
    [DevLogLevels.INFO]: console.info.bind(console),
    [DevLogLevels.WARN]: console.warn.bind(console),
  };
  return consoleMethodMap[level];
}

function logWarning(message: string): void {
  console.warn(message);
}
/* eslint-enable no-console */

function debouncedLog(
  key: string,
  level: DevLogLevel,
  message: string,
  data?: string,
): void {
  if (!isDev) {
    return;
  }

  const now = Date.now();
  const cached = logCache.get(key);

  if (cached && now - cached.lastTime < DEBOUNCE_MS) {
    cached.count++;
    return;
  }

  if (cached && cached.count > 1) {
    const cachedLogFn = getConsoleMethod(cached.level);
    const msg = `[DEV] ${cached.message} (×${cached.count} in ${DEBOUNCE_MS}ms)`;
    if (cached.data) {
      cachedLogFn(msg, cached.data);
    } else {
      cachedLogFn(msg);
    }
  }

  const logFn = getConsoleMethod(level);
  const logMsg = `[DEV:${key}] ${message}`;
  if (data !== undefined) {
    logFn(logMsg, data);
  } else {
    logFn(logMsg);
  }

  logCache.set(key, {
    count: 1,
    data,
    key,
    lastTime: now,
    level,
    message,
  });
}

function trackUpdate(key: string): { count: number; isExcessive: boolean } {
  if (!isDev) {
    return { count: 0, isExcessive: false };
  }

  const now = Date.now();
  const entry = updateCounts.get(key);

  if (!entry || now - entry.windowStart > UPDATE_WINDOW_MS) {
    updateCounts.set(key, { count: 1, windowStart: now });
    return { count: 1, isExcessive: false };
  }

  entry.count++;
  const isExcessive = entry.count > EXCESSIVE_UPDATE_THRESHOLD;

  if (isExcessive && entry.count === EXCESSIVE_UPDATE_THRESHOLD + 1) {
    logWarning(
      `[DEV:EXCESSIVE] ${key} updated ${entry.count} times in ${UPDATE_WINDOW_MS}ms`,
    );
  }

  return { count: entry.count, isExcessive };
}

function formatDebugValue(key: string, value: string | number | boolean | null | undefined): string {
  if (typeof value === 'boolean') {
    return `${key}=${value ? 1 : 0}`;
  }
  if (typeof value === 'number') {
    return `${key}=${value}`;
  }
  if (typeof value === 'string') {
    return `${key}=${value.length > 10 ? `${value.slice(0, 10)}…` : value}`;
  }
  if (value === null || value === undefined) {
    return `${key}=-`;
  }
  return `${key}=?`;
}

const RLOG_DEBOUNCE_MS = 100; // Reduced from 300ms for snappier logs
const rlogDebounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const rlogLastLogged: Record<string, string> = {};
let rlogEnabled = isDev;

function getRlogStyle(category: RlogCategory): string {
  return RLOG_CATEGORY_STYLES[category];
}

function rlogLog(category: RlogCategory, key: string, message: string): void {
  if (!rlogEnabled) {
    return;
  }

  // Skip empty threadId resume logs
  if (key === 'resume' && message.includes('tid= ')) {
    return;
  }

  // Use tier-based deduplication system (pass key for value-change detection)
  const dedupeCategory = `${category}-${key}`;
  const { shouldLog } = shouldLogWithDedupe(dedupeCategory, message, key);

  if (!shouldLog) {
    return;
  }

  const logKey = `${category}:${key}`;
  const fullMessage = `[${category}] ${message}`;

  // Skip exact duplicate messages
  if (rlogLastLogged[logKey] === fullMessage) {
    return;
  }

  // Clear any pending debounce timer
  if (rlogDebounceTimers[logKey]) {
    clearTimeout(rlogDebounceTimers[logKey]);
  }

  // Use short debounce for snappier logs
  rlogDebounceTimers[logKey] = setTimeout(() => {
    rlogLastLogged[logKey] = fullMessage;
    // eslint-disable-next-line no-console
    console.log(`%c${fullMessage}`, getRlogStyle(category));
  }, RLOG_DEBOUNCE_MS);
}

function rlogNow(category: RlogCategory, message: string): void {
  if (!rlogEnabled) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`%c[${category}] ${message}`, getRlogStyle(category));
}

/**
 * Frame descriptions from FLOW_DOCUMENTATION.md
 * Each frame represents a specific UI state in the round flow
 */
const FRAME_DESCRIPTIONS: Record<number, string> = {
  1: 'User Types Message on Overview Screen',
  10: 'Web Research Streaming (Blocks Participants)',
  11: 'Web Research Complete → Participants Start',
  12: 'Round 2 Complete',
  2: 'User Clicks Send → ALL Placeholders Appear Instantly',
  3: 'Participant 1 Starts Streaming (Others Still Waiting)',
  4: 'Participant 1 Complete → Participant 2 Starts',
  5: 'All Participants Complete → Moderator Starts',
  6: 'Round 1 Complete',
  7: 'User Enables Web Search + Changes Participants',
  8: 'Send Clicked → Changelog + All Placeholders Appear',
  9: 'Changelog Expanded (Click to See Details)',
};

export const rlog = {
  // ============================================================================
  // TIER 1: CRITICAL - Always log immediately (use rlogNow)
  // ============================================================================

  /** Changelog logging - important state changes */
  changelog: (action: string, detail: string): void => rlogLog(RlogCategories.CHANGELOG, action, `${action}: ${detail}`),

  disable: (): void => {
    rlogEnabled = false;
    safeStorageRemove('rlog', 'local');
  },

  disableVerbose: disableVerboseCategory,

  enable: (): void => {
    rlogEnabled = true;
    safeStorageSet('rlog', '1', 'local');
    // eslint-disable-next-line no-console
    console.log('%c[RLOG] Debug logging enabled', 'color: #4CAF50; font-weight: bold');
  },

  /** Enable verbose logging for a specific silent category */
  enableVerbose: enableVerboseCategory,

  // ============================================================================
  // TIER 2: FLOW - Log on state changes only (use rlogLog with key)
  // ============================================================================

  /** Flow logging (alias for resume) */
  flow: (key: string, detail: string): void => rlogLog(RlogCategories.RESUME, key, detail),

  /**
   * Frame-based logging for documenting round flow states
   * Frames 1-6: Round 1 flow (no web search)
   * Frames 7-12: Round 2 flow (with config changes + web search)
   */
  frame: (frameNumber: number, action: string, detail?: string): void => {
    const timestamp = Date.now() % 100000;
    const desc = FRAME_DESCRIPTIONS[frameNumber] || 'Unknown Frame';
    const msg = detail
      ? `[${timestamp}] Frame ${frameNumber}: ${desc} | ${action} | ${detail}`
      : `[${timestamp}] Frame ${frameNumber}: ${desc} | ${action}`;
    rlogNow(RlogCategories.FRAME, msg);
  },

  /** Gate check logging - logs on result change */
  gate: (check: string, result: string): void => rlogLog(RlogCategories.GATE, check, `${check}: ${result}`),

  /** Get/set verbose resume logging */
  getVerboseResume: isVerboseResumeEnabled,

  /** Participant handoff logging (P0 → P1 → P2 transitions) */
  handoff: (action: string, detail: string): void => rlogNow(RlogCategories.HANDOFF, `${action}: ${detail}`),

  // ============================================================================
  // TIER 3: DEBUG - Heavily throttled (2000ms between same logs)
  // ============================================================================

  /** Init logging - debounced to reduce noise from repeated renders */
  init: (action: string, detail: string): void => {
    const debounceKey = `init:${action}`;
    const { shouldLog, suppressedCount } = shouldLogDebounced(debounceKey, detail);
    if (!shouldLog) {
      return;
    }
    const suffix = suppressedCount > 0 ? ` (+${suppressedCount} suppressed)` : '';
    rlogLog(RlogCategories.INIT, action, `${detail}${suffix}`);
  },

  isEnabled: (): boolean => rlogEnabled,

  /** Summary of deduplicated log counts - useful at end of rounds */
  logDedupeStats: (): void => {
    if (!rlogEnabled) {
      return;
    }
    const stats = Array.from(dedupeMap.entries())
      .filter(([, e]) => e.count > 1)
      .map(([k, e]) => `${k.split(':')[0]}:×${e.count}`)
      .join(', ');
    if (stats) {
      // eslint-disable-next-line no-console
      console.log(`%c[DEDUPE-STATS] ${stats}`, 'color: #9E9E9E; font-style: italic');
    }
  },

  /** Moderator logging - 'chunk' debounced, other actions throttled */
  moderator: (action: string, detail: string): void => {
    // Debounce chunk logging to reduce noise from rapid streaming
    if (action === 'chunk' || action === 'append') {
      const debounceKey = `mod:${action}`;
      const { shouldLog, suppressedCount } = shouldLogDebounced(debounceKey, detail);
      if (!shouldLog) {
        return;
      }
      const suffix = suppressedCount > 0 ? ` (+${suppressedCount} suppressed)` : '';
      rlogLog(RlogCategories.MOD, 'moderator', `${action}: ${detail}${suffix}`);
      return;
    }
    rlogLog(RlogCategories.MOD, 'moderator', `${action}: ${detail}`);
  },

  /** Message logging - debounced to reduce noise */
  msg: (key: string, detail: string): void => {
    const debounceKey = `msg:${key}`;
    const { shouldLog, suppressedCount } = shouldLogDebounced(debounceKey, detail);
    if (!shouldLog) {
      return;
    }
    const suffix = suppressedCount > 0 ? ` (+${suppressedCount} suppressed)` : '';
    rlogLog(RlogCategories.MSG, key, `${detail}${suffix}`);
  },

  /** Phase logging - logs on value change */
  phase: (phase: string, detail: string): void => rlogLog(RlogCategories.PHASE, phase, `${phase}: ${detail}`),

  // ============================================================================
  // TIER 4: SILENT - Use enableVerboseCategory() to enable
  // chunk, render-state, query-render, stream-append are filtered by tier system
  // ============================================================================

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /** Presearch logging - 'partial-update' debounced, other actions throttled */
  presearch: (action: string, detail: string): void => {
    // Debounce partial-update and status-change to reduce noise from rapid SSE events
    if (action === 'partial-update' || action === 'status-change') {
      const debounceKey = `presearch:${action}`;
      const { shouldLog, suppressedCount } = shouldLogDebounced(debounceKey, detail);
      if (!shouldLog) {
        return;
      }
      const suffix = suppressedCount > 0 ? ` (+${suppressedCount} suppressed)` : '';
      rlogLog(RlogCategories.PRESRCH, action, `${action}: ${detail}${suffix}`);
      return;
    }
    rlogLog(RlogCategories.PRESRCH, action, `${action}: ${detail}`);
  },

  /** Race condition detection logging */
  race: (action: string, detail: string): void => rlogNow(RlogCategories.RACE, `${action}: ${detail}`),

  /**
   * Resume logging with verbose flag support.
   * Critical resume events always log, others require VERBOSE_RESUME.
   */
  resume: (key: string, detail: string): void => {
    const criticalKeys = new Set([
      'trigger',
      'in-progress-detected',
      'hook-result',
      'hook-fetch',
      'hook-parsed',
      'skip-stale',
      'fill-completed',
      'reset',
    ]);

    if (criticalKeys.has(key)) {
      rlogLog(RlogCategories.RESUME, key, detail);
      return;
    }

    if (!VERBOSE_RESUME) {
      return;
    }

    rlogLog(RlogCategories.RESUME, key, detail);
  },

  /** Resume logging that always logs (for state changes, errors) */
  resumeAlways: (key: string, detail: string): void => rlogLog(RlogCategories.RESUME, key, detail),
  setVerboseResume,

  /** State summary logging */
  state: (summary: string): void => rlogLog(RlogCategories.RESUME, 'state', summary),
  /** Stream logging - 'start'/'end' immediate, 'check' debounced to reduce noise */
  stream: (action: RlogStreamAction, detail: string): void => {
    // Keep 'start' and 'end' immediate (critical for debugging flow)
    if (action === 'start' || action === 'end') {
      rlogLog(RlogCategories.STREAM, 'stream', `${action}: ${detail}`);
      return;
    }
    // Debounce 'check' and 'skip' actions to reduce noise
    const debounceKey = `stream:${action}`;
    const { shouldLog, suppressedCount } = shouldLogDebounced(debounceKey, detail);
    if (!shouldLog) {
      return;
    }
    const suffix = suppressedCount > 0 ? ` (+${suppressedCount} suppressed)` : '';
    rlogLog(RlogCategories.STREAM, 'stream', `${action}: ${detail}${suffix}`);
  },

  /** Stuck state detection logging (blockers, timeouts, stuck rounds) */
  stuck: (action: string, detail: string): void => rlogNow(RlogCategories.STUCK, `${action}: ${detail}`),

  /** Submit action logging */
  submit: (action: string, detail: string): void => rlogNow(RlogCategories.SUBMIT, `${action}: ${detail}`),

  /** Sync logging - debounced to reduce noise */
  sync: (key: string, detail: string): void => {
    const debounceKey = `sync:${key}`;
    const { shouldLog, suppressedCount } = shouldLogDebounced(debounceKey, detail);
    if (!shouldLog) {
      return;
    }
    const suffix = suppressedCount > 0 ? ` (+${suppressedCount} suppressed)` : '';
    rlogLog(RlogCategories.SYNC, key, `${detail}${suffix}`);
  },

  /** Trigger logging - logs on action change */
  trigger: (action: string, detail: string): void => rlogLog(RlogCategories.TRIGGER, action, detail),
};

export const devLog = {
  d: (tag: string, data: DebugData): void => {
    const key = `d:${tag}`;
    const { isExcessive } = trackUpdate(key);
    if (isExcessive) {
      return;
    }

    const pairs = Object.entries(data)
      .map(([k, v]) => {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null || v === undefined) {
          return formatDebugValue(k, v);
        }
        return `${k}=${String(v)}`;
      })
      .join(' ');

    debouncedLog(key, DevLogLevels.DEBUG, pairs);
  },
};

// ============================================================================
// SERVER-SIDE LOGGING (SSR / Server Functions)
// ============================================================================

/**
 * Server-side log styles for SSR categories
 */
const SERVER_LOG_STYLES = {
  ERROR: 'color: #D32F2F; font-weight: bold',
  LOADER: 'color: #4ECDC4; font-weight: bold', // Teal - route loaders
  SERVERFN: 'color: #45B7D1; font-weight: bold', // Sky blue - server functions
  SESSION: 'color: #96CEB4; font-weight: bold', // Sage - session/auth
  SSR: 'color: #FF6B6B; font-weight: bold', // Coral - server rendering
} as const;

type ServerLogCategory = keyof typeof SERVER_LOG_STYLES;

/**
 * Format data for server logging (key=value pairs)
 */
function formatServerData(data?: Record<string, string | number | boolean | null | undefined>): string {
  if (!data) {
    return '';
  }
  return Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => formatDebugValue(k, v))
    .join(' ');
}

/**
 * Server-side immediate log (no debouncing, works in SSR context)
 * Uses direct console.log - shows in terminal during wrangler dev
 */
function serverLogNow(
  category: ServerLogCategory,
  action: string,
  message: string,
  data?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!isDev) {
    return;
  }
  const dataStr = formatServerData(data);
  const fullMessage = dataStr ? `${message} ${dataStr}` : message;
  const style = SERVER_LOG_STYLES[category];
  // eslint-disable-next-line no-console
  console.log(`%c[${category}:${action}] ${fullMessage}`, style);
}

/**
 * Server-side logger for SSR and server functions.
 * Uses direct console.log without browser-specific deduplication.
 *
 * @example
 * import { serverLog } from '@/lib/utils/dev-logger';
 *
 * serverLog.ssr('render', '/chat/123', { durationMs: 45 });
 * serverLog.serverFn('call', 'getSession', { durationMs: 12 });
 */
export const serverLog = {
  error: (message: string, data?: Record<string, string | number | boolean | null | undefined>): void => {
    serverLogNow('ERROR', 'error', message, data);
  },

  loader: (action: string, message: string, data?: Record<string, string | number | boolean | null | undefined>): void => {
    serverLogNow('LOADER', action, message, data);
  },

  serverFn: (action: string, message: string, data?: Record<string, string | number | boolean | null | undefined>): void => {
    serverLogNow('SERVERFN', action, message, data);
  },

  session: (action: string, message: string, data?: Record<string, string | number | boolean | null | undefined>): void => {
    serverLogNow('SESSION', action, message, data);
  },

  ssr: (action: string, message: string, data?: Record<string, string | number | boolean | null | undefined>): void => {
    serverLogNow('SSR', action, message, data);
  },
};
