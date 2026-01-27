import type { DebugData, DevLogLevel, RlogCategory, RlogStreamAction } from '@roundtable/shared';
import { DevLogLevels, RLOG_CATEGORY_STYLES, RlogCategories } from '@roundtable/shared';
import { WebAppEnvs } from '@roundtable/shared/enums';

import { getWebappEnv } from '@/lib/config/base-urls';

import { safeStorageRemove, safeStorageSet } from './safe-storage';

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
      // eslint-disable-next-line no-console
      console.log(`%c[${category}]${countStr} ${message}`, getRlogStyle(category));
      tracker.count = 0;
      tracker.lastFlush = now;
    }

    rlogFireCounts[logKey] = tracker;
    return;
  }

  if (rlogLastLogged[logKey] === fullMessage) {
    return;
  }

  if (rlogDebounceTimers[logKey]) {
    clearTimeout(rlogDebounceTimers[logKey]);
  }

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
    const desc = FRAME_DESCRIPTIONS[frameNumber] || 'Unknown Frame';
    const msg = detail
      ? `Frame ${frameNumber}: ${desc} | ${action} | ${detail}`
      : `Frame ${frameNumber}: ${desc} | ${action}`;
    rlogNow(RlogCategories.FRAME, msg);
  },
  gate: (check: string, result: string): void => rlogLog(RlogCategories.GATE, check, `${check}: ${result}`),
  // ✅ Participant handoff logging (P0 → P1 → P2 transitions)
  handoff: (action: string, detail: string): void => rlogNow(RlogCategories.HANDOFF, `${action}: ${detail}`),
  // ✅ DEBOUNCE FIX: Changed init from rlogNow to rlogLog
  // timeline-render fires on every re-render, causing excessive console spam
  init: (action: string, detail: string): void => rlogLog(RlogCategories.INIT, action, detail),
  isEnabled: (): boolean => rlogEnabled,
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
  presearch: (action: string, detail: string): void => rlogNow(RlogCategories.PRESRCH, `${action}: ${detail}`),
  // ✅ Race condition detection logging
  race: (action: string, detail: string): void => rlogNow(RlogCategories.RACE, `${action}: ${detail}`),
  resume: (key: string, detail: string): void => rlogLog(RlogCategories.RESUME, key, detail),
  state: (summary: string): void => rlogLog(RlogCategories.RESUME, 'state', summary),
  // ✅ DEBOUNCE FIX: All stream logs now debounced - fires frequently during streaming
  stream: (action: RlogStreamAction, detail: string): void =>
    rlogLog(RlogCategories.STREAM, 'stream', `${action}: ${detail}`),
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
