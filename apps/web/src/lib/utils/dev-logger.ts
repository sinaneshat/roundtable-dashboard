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
// ENHANCED DEDUPLICATION SYSTEM
// ============================================================================

const LOG_DEDUPE_WINDOW_MS = 3000; // Collapse logs within 3 second window (increased from 2s)
const LOG_DEDUPE_REPORT_THRESHOLD = 5; // Report count after N duplicates
const LOG_THROTTLE_HIGH_FREQ_MS = 1000; // Throttle high-frequency logs to 1/second

type DedupeEntry = {
  count: number;
  firstTime: number;
  lastTime: number;
  lastArgs: string;
  reported: boolean;
};

// Track previous values for value-change detection (INIT/MSG/SYNC)
const prevValuesMap = new Map<string, string>();

const dedupeMap = new Map<string, DedupeEntry>();
const throttleMap = new Map<string, number>(); // category -> lastLogTime

// Categories that should be throttled (high frequency, low value)
const HIGH_FREQ_CATEGORIES = new Set([
  'stream-append',
  'chunk',
  'render-state',
  'query-render',
  'stream',
  'moderator',
  'init', // Fires on every render
  'resume', // Fires repeatedly during streaming
  'msg', // Fires on every message count change
  'sync', // Fires on every sync operation
  'trigger', // Fires on every trigger check
]);

// Categories that should NEVER be deduplicated (critical for debugging)
const CRITICAL_CATEGORIES = new Set([
  'phase-transition',
  'round-complete',
  'pcount-mismatch',
  'race-detected',
  'round-ref-lag', // NEW: when presearch/mod check references wrong round
  'state-desync', // NEW: when store and props diverge
  'stuck',
  'error',
  'start',
  'end',
  'complete',
  'trigger',
  'handoff',
  'submit',
  'changelog',
  'frame',
  'race',
]);

// Categories that should only log on value changes
const VALUE_CHANGE_CATEGORIES = new Set([
  'init',
  'msg',
  'sync',
]);

function shouldLogWithDedupe(category: string, message: string, key?: string): { shouldLog: boolean; suffix?: string } {
  // Never dedupe critical categories
  if (CRITICAL_CATEGORIES.has(category)) {
    return { shouldLog: true };
  }

  // Skip APPEND logs entirely - they add no debugging value
  if (message.includes('APPEND')) {
    return { shouldLog: false };
  }

  const now = Date.now();
  const dedupeKey = `${category}:${message.slice(0, 80)}`; // Truncate for key stability

  // Value-change detection for init/msg/sync categories
  // Only log when the actual value changes
  if (VALUE_CHANGE_CATEGORIES.has(category) && key) {
    const valueKey = `${category}:${key}`;
    const prevValue = prevValuesMap.get(valueKey);
    if (prevValue === message) {
      // Same value as before - skip entirely (no counting)
      return { shouldLog: false };
    }
    prevValuesMap.set(valueKey, message);
    // Continue to normal dedupe logic but with value changed
  }

  // Throttle high-frequency categories
  if (HIGH_FREQ_CATEGORIES.has(category)) {
    const lastLog = throttleMap.get(category) ?? 0;
    if (now - lastLog < LOG_THROTTLE_HIGH_FREQ_MS) {
      // Update dedupe count silently
      const entry = dedupeMap.get(dedupeKey);
      if (entry) {
        entry.count++;
        entry.lastTime = now;
      } else {
        dedupeMap.set(dedupeKey, { count: 1, firstTime: now, lastArgs: message, lastTime: now, reported: false });
      }
      return { shouldLog: false };
    }
    throttleMap.set(category, now);
  }

  // Check dedupe window
  const entry = dedupeMap.get(dedupeKey);

  if (!entry || now - entry.lastTime > LOG_DEDUPE_WINDOW_MS) {
    // Window expired or new entry - report previous count if needed
    let suffix: string | undefined;
    if (entry && entry.count > 1 && !entry.reported) {
      suffix = `[×${entry.count}]`;
    }

    // Start new window
    dedupeMap.set(dedupeKey, { count: 1, firstTime: now, lastArgs: message, lastTime: now, reported: false });
    return { shouldLog: true, suffix };
  }

  // Within window - increment and check threshold
  entry.count++;
  entry.lastTime = now;

  if (entry.count === LOG_DEDUPE_REPORT_THRESHOLD && !entry.reported) {
    entry.reported = true;
    return { shouldLog: true, suffix: `[×${entry.count}]` };
  }

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

const RLOG_DEBOUNCE_MS = 300;
const RLOG_RAPID_DEBOUNCE_MS = 1000; // Longer debounce for rapid-fire logs
const rlogDebounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const rlogLastLogged: Record<string, string> = {};
const rlogFireCounts: Record<string, { count: number; lastFlush: number }> = {};
let rlogEnabled = isDev;

// Track keys that fire rapidly and should be suppressed with counts
const RAPID_FIRE_KEYS = new Set([
  'noprefill-check',
  'noprefill-skip',
  'noprefill-completion',
  'stream', // Debounce all [STREAM] logs (fires frequently during streaming)
  'ui-groups', // Debounce [PHASE] UI-groups-in logs (fires on every render)
  'moderator', // Debounce [MOD] logs (fires frequently during streaming)
]);

function getRlogStyle(category: RlogCategory): string {
  return RLOG_CATEGORY_STYLES[category];
}

function rlogLog(category: RlogCategory, key: string, message: string): void {
  if (!rlogEnabled) {
    return;
  }

  // Skip "SKIP" messages - they add no debugging value
  if (message.includes('SKIP:')) {
    return;
  }

  // Skip empty threadId resume logs
  if (key === 'resume' && message.includes('tid= ')) {
    return;
  }

  // Use enhanced deduplication system (pass key for value-change detection)
  const dedupeCategory = `${category}-${key}`;
  const { shouldLog, suffix } = shouldLogWithDedupe(dedupeCategory, message, key);

  if (!shouldLog) {
    return;
  }

  const logKey = `${category}:${key}`;
  const fullMessage = `[${category}] ${message}`;

  // For rapid-fire logs, use longer debounce and show fire counts
  if (RAPID_FIRE_KEYS.has(key)) {
    const now = Date.now();
    const tracker = rlogFireCounts[logKey] || { count: 0, lastFlush: 0 };

    tracker.count++;

    // Flush: either first call (lastFlush=0) or after RAPID_DEBOUNCE_MS
    if (tracker.lastFlush === 0 || now - tracker.lastFlush >= RLOG_RAPID_DEBOUNCE_MS) {
      const countStr = tracker.count > 1 ? ` [×${tracker.count}]` : '';
      const dedupeStr = suffix ? ` ${suffix}` : '';
      // eslint-disable-next-line no-console
      console.log(`%c[${category}]${countStr}${dedupeStr} ${message}`, getRlogStyle(category));
      tracker.count = 0;
      tracker.lastFlush = now;
    }

    rlogFireCounts[logKey] = tracker;
    return;
  }

  if (rlogLastLogged[logKey] === fullMessage && !suffix) {
    return;
  }

  if (rlogDebounceTimers[logKey]) {
    clearTimeout(rlogDebounceTimers[logKey]);
  }

  rlogDebounceTimers[logKey] = setTimeout(() => {
    rlogLastLogged[logKey] = fullMessage;
    const logMessage = suffix ? `${fullMessage} ${suffix}` : fullMessage;
    // eslint-disable-next-line no-console
    console.log(`%c${logMessage}`, getRlogStyle(category));
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
  changelog: (action: string, detail: string): void => rlogNow(RlogCategories.CHANGELOG, `${action}: ${detail}`),
  disable: (): void => {
    rlogEnabled = false;
    safeStorageRemove('rlog', 'local');
  },
  enable: (): void => {
    rlogEnabled = true;
    safeStorageSet('rlog', '1', 'local');
    // eslint-disable-next-line no-console
    console.log('%c[RLOG] Resumption debug logging enabled', 'color: #4CAF50; font-weight: bold');
  },
  flow: (key: string, detail: string): void => rlogLog(RlogCategories.RESUME, key, detail),
  /**
   * Frame-based logging for documenting round flow states
   * Frames 1-6: Round 1 flow (no web search)
   * Frames 7-12: Round 2 flow (with config changes + web search)
   *
   * Usage: rlog.frame(2, 'placeholders created', { p1: 'Thinking', p2: 'Thinking', mod: 'Observing' })
   */
  frame: (frameNumber: number, action: string, detail?: string): void => {
    const timestamp = Date.now() % 100000; // Last 5 digits for readability
    const desc = FRAME_DESCRIPTIONS[frameNumber] || 'Unknown Frame';
    const msg = detail
      ? `[${timestamp}] Frame ${frameNumber}: ${desc} | ${action} | ${detail}`
      : `[${timestamp}] Frame ${frameNumber}: ${desc} | ${action}`;
    rlogNow(RlogCategories.FRAME, msg);
  },
  gate: (check: string, result: string): void => rlogLog(RlogCategories.GATE, check, `${check}: ${result}`),
  // ✅ Participant handoff logging (P0 → P1 → P2 transitions)
  handoff: (action: string, detail: string): void => rlogNow(RlogCategories.HANDOFF, `${action}: ${detail}`),
  // ✅ DEBOUNCE FIX: Changed init from rlogNow to rlogLog
  // timeline-render fires on every re-render, causing excessive console spam
  init: (action: string, detail: string): void => rlogLog(RlogCategories.INIT, action, detail),
  isEnabled: (): boolean => rlogEnabled,
  // Summary of deduplicated log counts (call at end of rounds for debugging)
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
  // ✅ DEBOUNCE FIX: Changed from rlogNow to rlogLog - fires frequently during streaming
  moderator: (action: string, detail: string): void => rlogLog(RlogCategories.MOD, 'moderator', `${action}: ${detail}`),
  msg: (key: string, detail: string): void => rlogLog(RlogCategories.MSG, key, detail),
  phase: (phase: string, detail: string): void => {
    // Debounce UI-groups-in logs which fire on every render
    if (phase === 'UI-groups-in') {
      rlogLog(RlogCategories.PHASE, 'ui-groups', `${phase}: ${detail}`);
    } else {
      rlogNow(RlogCategories.PHASE, `${phase}: ${detail}`);
    }
  },
  // Presearch - keep important logs, throttle render logs
  presearch: (action: string, detail: string): void => {
    // Throttle render-related logs that fire frequently
    if (action === 'render-state' || action === 'query-render') {
      rlogLog(RlogCategories.PRESRCH, 'presearch-render', `${action}: ${detail}`);
    } else {
      rlogNow(RlogCategories.PRESRCH, `${action}: ${detail}`);
    }
  },
  // ✅ Race condition detection logging
  race: (action: string, detail: string): void => rlogNow(RlogCategories.RACE, `${action}: ${detail}`),
  resume: (key: string, detail: string): void => rlogLog(RlogCategories.RESUME, key, detail),
  state: (summary: string): void => rlogLog(RlogCategories.RESUME, 'state', summary),
  // ✅ DEBOUNCE FIX: All stream logs now debounced - fires frequently during streaming
  // Skip APPEND logs entirely - they add no debugging value
  stream: (action: RlogStreamAction, detail: string): void => {
    if (detail.includes('APPEND')) {
      return; // Skip APPEND logs entirely - they add no debugging value
    }
    rlogLog(RlogCategories.STREAM, 'stream', `${action}: ${detail}`);
  },
  // ✅ Stuck state detection logging (blockers, timeouts, stuck rounds)
  stuck: (action: string, detail: string): void => rlogNow(RlogCategories.STUCK, `${action}: ${detail}`),
  submit: (action: string, detail: string): void => rlogNow(RlogCategories.SUBMIT, `${action}: ${detail}`),
  sync: (key: string, detail: string): void => rlogLog(RlogCategories.SYNC, key, detail),
  // ✅ DEBOUNCE FIX: Changed trigger/init from rlogNow to rlogLog
  // These fire frequently during renders and participant checks, causing console spam
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
