type LogCategory
  = 'PHASE'
    | 'RESUME'
    | 'STREAM'
    | 'MSG'
    | 'GATE'
    | 'TRIGGER'
    | 'PRESRCH'
    | 'MOD';

const debounceTimers: Record<string, NodeJS.Timeout> = {};
const DEBOUNCE_MS = 300;
const lastLogged: Record<string, string> = {};
let enabled = false;

function log(category: LogCategory, key: string, message: string) {
  if (!enabled)
    return;

  const logKey = `${category}:${key}`;
  const fullMessage = `[${category}] ${message}`;

  if (lastLogged[logKey] === fullMessage)
    return;

  if (debounceTimers[logKey]) {
    clearTimeout(debounceTimers[logKey]);
  }

  debounceTimers[logKey] = setTimeout(() => {
    lastLogged[logKey] = fullMessage;
    // eslint-disable-next-line no-console
    console.log(`%c${fullMessage}`, getStyle(category));
  }, DEBOUNCE_MS);
}

function getStyle(category: LogCategory): string {
  switch (category) {
    case 'PHASE':
      return 'color: #4CAF50; font-weight: bold';
    case 'RESUME':
      return 'color: #2196F3; font-weight: bold';
    case 'STREAM':
      return 'color: #FF9800';
    case 'MSG':
      return 'color: #9C27B0';
    case 'GATE':
      return 'color: #F44336';
    case 'TRIGGER':
      return 'color: #00BCD4; font-weight: bold';
    case 'PRESRCH':
      return 'color: #E91E63';
    case 'MOD':
      return 'color: #673AB7; font-weight: bold';
    default:
      return '';
  }
}

function logNow(category: LogCategory, message: string) {
  if (!enabled)
    return;
  // eslint-disable-next-line no-console
  console.log(`%c[${category}] ${message}`, getStyle(category));
}

export const rlog = {
  enable: () => {
    enabled = true;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('rlog', '1');
    }
    // eslint-disable-next-line no-console
    console.log('%c[RLOG] Resumption debug logging enabled', 'color: #4CAF50; font-weight: bold');
  },
  disable: () => {
    enabled = false;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('rlog');
    }
  },
  isEnabled: () => enabled,
  phase: (phase: string, detail: string) => logNow('PHASE', `${phase}: ${detail}`),
  resume: (key: string, detail: string) => log('RESUME', key, detail),
  stream: (action: 'start' | 'end' | 'resume' | 'check', detail: string) => logNow('STREAM', `${action}: ${detail}`),
  msg: (key: string, detail: string) => log('MSG', key, detail),
  gate: (check: string, result: string) => log('GATE', check, `${check}: ${result}`),
  trigger: (action: string, detail: string) => logNow('TRIGGER', `${action}: ${detail}`),
  presearch: (action: string, detail: string) => logNow('PRESRCH', `${action}: ${detail}`),
  moderator: (action: string, detail: string) => logNow('MOD', `${action}: ${detail}`),
  state: (summary: string) => log('RESUME', 'state', summary),
  snapshot: (hookName: string, data: {
    round?: number | null;
    phase?: string | null;
    pIdx?: number | null;
    msgs?: number;
    streaming?: boolean;
    waiting?: boolean;
  }) => {
    if (!enabled)
      return;
    const parts: string[] = [];
    if (data.round !== undefined && data.round !== null)
      parts.push(`r${data.round}`);
    if (data.phase)
      parts.push(data.phase);
    if (data.pIdx !== undefined && data.pIdx !== null)
      parts.push(`p${data.pIdx}`);
    if (data.msgs !== undefined)
      parts.push(`${data.msgs}msg`);
    if (data.streaming)
      parts.push('STRM');
    if (data.waiting)
      parts.push('WAIT');
    logNow('RESUME', `[${hookName}] ${parts.join(' ')}`);
  },
};

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as { rlog?: typeof rlog }).rlog = rlog;
  if (typeof localStorage !== 'undefined' && localStorage.getItem('rlog') === '1') {
    enabled = true;
  }
}
