/* eslint-disable no-console */
import type { DevLogLevel } from '@/api/core/enums';
import { DevLogLevels } from '@/api/core/enums';

type LogEntry = {
  key: string;
  level: DevLogLevel;
  message: string;
  data?: unknown;
  count: number;
  lastTime: number;
};

const DEBOUNCE_MS = 500;
const logCache = new Map<string, LogEntry>();
const updateCounts = new Map<string, { count: number; windowStart: number }>();
const UPDATE_WINDOW_MS = 1000;
const EXCESSIVE_UPDATE_THRESHOLD = 10;
const isDev = process.env.NODE_ENV === 'development';
function debouncedLog(
  key: string,
  level: DevLogLevel,
  message: string,
  data?: unknown,
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
    console[cached.level](
      `[DEV] ${cached.message} (×${cached.count} in ${DEBOUNCE_MS}ms)`,
      cached.data,
    );
  }

  const logFn = console[level];
  if (data !== undefined) {
    logFn(`[DEV:${key}] ${message}`, data);
  } else {
    logFn(`[DEV:${key}] ${message}`);
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
    console.warn(
      `[DEV:EXCESSIVE] ${key} updated ${entry.count} times in ${UPDATE_WINDOW_MS}ms`,
    );
  }

  return { count: entry.count, isExcessive };
}
export const devLog = {
  d: (tag: string, data: Record<string, unknown>) => {
    const key = `d:${tag}`;
    const { isExcessive } = trackUpdate(key);
    if (isExcessive)
      return;

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

    debouncedLog(key, DevLogLevels.DEBUG, pairs);
  },

  mod: (event: 'start' | 'text' | 'done' | 'add' | 'err', data?: Record<string, unknown>) => {
    const key = `mod:${event}`;
    if (event === 'text') {
      trackUpdate(key);
      return;
    }
    const pairs = data
      ? Object.entries(data).map(([k, v]) => `${k}=${v}`).join(' ')
      : '';
    debouncedLog(key, DevLogLevels.INFO, pairs);
  },

  msg: (event: 'sync' | 'flash', delta: number, extra?: string) => {
    const key = `msg:${event}`;
    const { isExcessive } = trackUpdate(key);
    if (isExcessive)
      return;
    if (delta === 0 && event === 'sync')
      return;
    debouncedLog(key, DevLogLevels.DEBUG, `Δ${delta}${extra ? ` ${extra}` : ''}`);
  },

  render: (component: string) => {
    const key = `r:${component}`;
    const { count, isExcessive } = trackUpdate(key);
    if (isExcessive && count % 10 === 0) {
      console.warn(`[!R] ${component} ×${count}/s`);
    }
  },

  reset: () => {
    logCache.clear();
    updateCounts.clear();
  },
};

export type DevLogger = typeof devLog;
