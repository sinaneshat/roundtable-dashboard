import type { DebugData, DevLogLevel, RlogCategory, RlogStreamAction } from '@/api/core/enums';
import { DevLogLevels, RLOG_CATEGORY_STYLES, RlogCategories } from '@/api/core/enums';

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

const isDev = process.env.NODE_ENV === 'development';

/* eslint-disable no-console */
function getConsoleMethod(level: DevLogLevel): typeof console.debug {
  const consoleMethodMap: Record<DevLogLevel, typeof console.debug> = {
    [DevLogLevels.DEBUG]: console.debug.bind(console),
    [DevLogLevels.INFO]: console.info.bind(console),
    [DevLogLevels.WARN]: console.warn.bind(console),
    [DevLogLevels.ERROR]: console.error.bind(console),
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
  if (!isDev)
    return;

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
    key,
    level,
    message,
    data,
    count: 1,
    lastTime: now,
  });
}

function trackUpdate(key: string): { count: number; isExcessive: boolean } {
  if (!isDev)
    return { count: 0, isExcessive: false };

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
  if (typeof value === 'boolean')
    return `${key}=${value ? 1 : 0}`;
  if (typeof value === 'number')
    return `${key}=${value}`;
  if (typeof value === 'string')
    return `${key}=${value.length > 10 ? `${value.slice(0, 10)}…` : value}`;
  if (value === null || value === undefined)
    return `${key}=-`;
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
  if (!rlogEnabled)
    return;

  const logKey = `${category}:${key}`;
  const fullMessage = `[${category}] ${message}`;

  if (rlogLastLogged[logKey] === fullMessage)
    return;

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
  if (!rlogEnabled)
    return;
  // eslint-disable-next-line no-console
  console.log(`%c[${category}] ${message}`, getRlogStyle(category));
}

export const rlog = {
  enable: (): void => {
    rlogEnabled = true;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('rlog', '1');
    }
    // eslint-disable-next-line no-console
    console.log('%c[RLOG] Resumption debug logging enabled', 'color: #4CAF50; font-weight: bold');
  },
  disable: (): void => {
    rlogEnabled = false;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('rlog');
    }
  },
  isEnabled: (): boolean => rlogEnabled,
  phase: (phase: string, detail: string): void => rlogNow(RlogCategories.PHASE, `${phase}: ${detail}`),
  resume: (key: string, detail: string): void => rlogLog(RlogCategories.RESUME, key, detail),
  stream: (action: RlogStreamAction, detail: string): void => rlogNow(RlogCategories.STREAM, `${action}: ${detail}`),
  msg: (key: string, detail: string): void => rlogLog(RlogCategories.MSG, key, detail),
  gate: (check: string, result: string): void => rlogLog(RlogCategories.GATE, check, `${check}: ${result}`),
  trigger: (action: string, detail: string): void => rlogNow(RlogCategories.TRIGGER, `${action}: ${detail}`),
  presearch: (action: string, detail: string): void => rlogNow(RlogCategories.PRESRCH, `${action}: ${detail}`),
  moderator: (action: string, detail: string): void => rlogNow(RlogCategories.MOD, `${action}: ${detail}`),
  state: (summary: string): void => rlogLog(RlogCategories.RESUME, 'state', summary),
  changelog: (action: string, detail: string): void => rlogNow(RlogCategories.CHANGELOG, `${action}: ${detail}`),
  submit: (action: string, detail: string): void => rlogNow(RlogCategories.SUBMIT, `${action}: ${detail}`),
};

export const devLog = {
  d: (tag: string, data: DebugData): void => {
    const key = `d:${tag}`;
    const { isExcessive } = trackUpdate(key);
    if (isExcessive)
      return;

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
