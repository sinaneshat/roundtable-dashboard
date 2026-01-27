import { DevLogLevels, NodeEnvs, RLOG_CATEGORY_STYLES, RlogCategories } from '@roundtable/shared';
import type { DebugData, DevLogLevel, RlogCategory, RlogStreamAction } from '@roundtable/shared/enums';

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

const isDev = process.env.NODE_ENV === NodeEnvs.DEVELOPMENT;

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

  // Build entry with only defined properties (satisfies exactOptionalPropertyTypes)
  const entry: LogEntry = {
    count: 1,
    key,
    lastTime: now,
    level,
    message,
  };
  if (data !== undefined) {
    entry.data = data;
  }
  logCache.set(key, entry);
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

  const logKey = `${category}:${key}`;
  const fullMessage = `[${category}] ${message}`;

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
 *
 * Backend logs these to correlate with frontend frame logging
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
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('rlog');
    }
  },
  enable: (): void => {
    rlogEnabled = true;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('rlog', '1');
    }
    // eslint-disable-next-line no-console
    console.log('%c[RLOG] Resumption debug logging enabled', 'color: #4CAF50; font-weight: bold');
  },
  /**
   * Frame-based logging for documenting round flow states
   * Frames 1-6: Round 1 flow (no web search)
   * Frames 7-12: Round 2 flow (with config changes + web search)
   *
   * Usage: rlog.frame(2, 'round-init', 'pCount=3 tid=abc123')
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
  moderator: (action: string, detail: string): void => rlogNow(RlogCategories.MOD, `${action}: ${detail}`),
  msg: (key: string, detail: string): void => rlogLog(RlogCategories.MSG, key, detail),
  phase: (phase: string, detail: string): void => rlogNow(RlogCategories.PHASE, `${phase}: ${detail}`),
  presearch: (action: string, detail: string): void => rlogNow(RlogCategories.PRESRCH, `${action}: ${detail}`),
  // ✅ Race condition detection logging
  race: (action: string, detail: string): void => rlogNow(RlogCategories.RACE, `${action}: ${detail}`),
  resume: (key: string, detail: string): void => rlogLog(RlogCategories.RESUME, key, detail),
  state: (summary: string): void => rlogLog(RlogCategories.RESUME, 'state', summary),
  stream: (action: RlogStreamAction, detail: string): void => rlogNow(RlogCategories.STREAM, `${action}: ${detail}`),
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
