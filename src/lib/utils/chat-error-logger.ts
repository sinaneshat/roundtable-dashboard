/**
 * Chat Error Logging Utilities
 *
 * Centralized logging system for chat initialization and streaming errors.
 * Provides structured logging with context and error tracking capabilities.
 *
 * Key Features:
 * - Structured error logging with context
 * - State change tracking (messages, participants, thread)
 * - Performance monitoring (initialization timing)
 * - Error classification and reporting
 *
 * Usage:
 * ```typescript
 * import { chatLogger } from '@/lib/utils/chat-error-logger';
 *
 * // Log initialization
 * chatLogger.threadInit('thread-123', { participantCount: 3, messageCount: 1 });
 *
 * // Log errors
 * chatLogger.error('THREAD_CREATE_FAILED', error, { threadId: 'thread-123' });
 *
 * // Log state changes
 * chatLogger.stateChange('messages', { before: 0, after: 5, reason: 'initializeThread' });
 * ```
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type ChatErrorCode
  = | 'THREAD_CREATE_FAILED'
    | 'THREAD_INIT_FAILED'
    | 'MESSAGE_LOAD_FAILED'
    | 'STREAM_FAILED'
    | 'ANALYSIS_FAILED'
    | 'CONTEXT_SYNC_FAILED'
    | 'INVALID_STATE'
    | 'NETWORK_ERROR'
    | 'UNKNOWN_ERROR';

type LogContext = {
  threadId?: string;
  participantCount?: number;
  messageCount?: number;
  roundNumber?: number;
  phase?: string;
  [key: string]: unknown;
};

type StateChangeDetails = {
  before: unknown;
  after: unknown;
  reason: string;
  timestamp?: number;
};

/**
 * Format log message with timestamp and context
 */
function formatLogMessage(
  level: LogLevel,
  component: string,
  message: string,
  context?: LogContext,
): string {
  const timestamp = new Date().toISOString();
  const contextStr = context ? JSON.stringify(context, null, 2) : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${component}] ${message}${contextStr ? `\n${contextStr}` : ''}`;
}

/**
 * Log to console with appropriate method based on level
 */
function logToConsole(level: LogLevel, ...args: unknown[]): void {
  switch (level) {
    case 'debug':
      console.debug(...args);
      break;
    case 'info':
      console.info(...args);
      break;
    case 'warn':
      console.warn(...args);
      break;
    case 'error':
      console.error(...args);
      break;
  }
}

/**
 * Check if we should log at the given level
 * In production, only log warnings and errors
 */
function shouldLog(level: LogLevel): boolean {
  if (typeof window === 'undefined') {
    return true; // Always log server-side
  }

  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isDevelopment) {
    return true; // Log everything in development
  }

  // In production, only log warnings and errors
  return level === 'warn' || level === 'error';
}

/**
 * Chat Context Logger
 * Logs all chat context operations and state changes
 */
export const chatContextLogger = {
  /**
   * Log thread initialization
   */
  threadInit: (threadId: string, context?: LogContext) => {
    if (!shouldLog('info'))
      return;

    const message = formatLogMessage(
      'info',
      'ChatContext',
      'Thread initialized',
      { threadId, ...context },
    );
    logToConsole('info', message);
  },

  /**
   * Log thread reinitialization (when threadId changes)
   */
  threadReinit: (oldThreadId: string | null, newThreadId: string, context?: LogContext) => {
    if (!shouldLog('warn'))
      return;

    const message = formatLogMessage(
      'warn',
      'ChatContext',
      'Thread reinitialized - useChat hook reset',
      { oldThreadId, newThreadId, ...context },
    );
    logToConsole('warn', message);
  },

  /**
   * Log message state changes
   */
  messagesChanged: (details: StateChangeDetails & { messages?: unknown[] }) => {
    if (!shouldLog('debug'))
      return;

    const message = formatLogMessage(
      'debug',
      'ChatContext',
      'Messages changed',
      {
        count: typeof details.after === 'number' ? details.after : 'unknown',
        reason: details.reason,
        messages: details.messages,
      },
    );
    logToConsole('debug', message);
  },

  /**
   * Log setMessages calls
   */
  setMessages: (count: number, reason: string, context?: LogContext) => {
    if (!shouldLog('debug'))
      return;

    const message = formatLogMessage(
      'debug',
      'ChatContext',
      'setMessages called',
      { count, reason, ...context },
    );
    logToConsole('debug', message);
  },

  /**
   * Log participant updates
   */
  participantsChanged: (details: StateChangeDetails) => {
    if (!shouldLog('debug'))
      return;

    const message = formatLogMessage(
      'debug',
      'ChatContext',
      'Participants changed',
      details,
    );
    logToConsole('debug', message);
  },

  /**
   * Log errors in chat context
   */
  error: (errorCode: ChatErrorCode, error: unknown, context?: LogContext) => {
    if (!shouldLog('error'))
      return;

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    const message = formatLogMessage(
      'error',
      'ChatContext',
      `Error: ${errorCode}`,
      { ...context, errorMessage, errorStack },
    );
    logToConsole('error', message, error);
  },
};

/**
 * Chat Overview Screen Logger
 * Logs all chat overview screen operations and lifecycle events
 */
export const chatOverviewLogger = {
  /**
   * Log form submission
   */
  formSubmit: (context: LogContext) => {
    if (!shouldLog('info'))
      return;

    const message = formatLogMessage(
      'info',
      'ChatOverviewScreen',
      'Form submitted - creating thread',
      context,
    );
    logToConsole('info', message);
  },

  /**
   * Log thread creation success
   */
  threadCreated: (threadId: string, context?: LogContext) => {
    if (!shouldLog('info'))
      return;

    const message = formatLogMessage(
      'info',
      'ChatOverviewScreen',
      'Thread created successfully',
      { threadId, ...context },
    );
    logToConsole('info', message);
  },

  /**
   * Log auto-start round trigger
   */
  autoStartRound: (context: LogContext) => {
    if (!shouldLog('info'))
      return;

    const message = formatLogMessage(
      'info',
      'ChatOverviewScreen',
      'Auto-starting round after initialization',
      context,
    );
    logToConsole('info', message);
  },

  /**
   * Log analysis creation
   */
  analysisCreated: (roundNumber: number, context?: LogContext) => {
    if (!shouldLog('info'))
      return;

    const message = formatLogMessage(
      'info',
      'ChatOverviewScreen',
      'Pending analysis created',
      { roundNumber, ...context },
    );
    logToConsole('info', message);
  },

  /**
   * Log navigation
   */
  navigate: (destination: string, context?: LogContext) => {
    if (!shouldLog('info'))
      return;

    const message = formatLogMessage(
      'info',
      'ChatOverviewScreen',
      'Navigating to thread detail',
      { destination, ...context },
    );
    logToConsole('info', message);
  },

  /**
   * Log errors in overview screen
   */
  error: (errorCode: ChatErrorCode, error: unknown, context?: LogContext) => {
    if (!shouldLog('error'))
      return;

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    const message = formatLogMessage(
      'error',
      'ChatOverviewScreen',
      `Error: ${errorCode}`,
      { ...context, errorMessage, errorStack },
    );
    logToConsole('error', message, error);
  },

  /**
   * Log warnings in overview screen
   */
  warn: (warningMessage: string, context?: LogContext) => {
    if (!shouldLog('warn'))
      return;

    const message = formatLogMessage(
      'warn',
      'ChatOverviewScreen',
      warningMessage,
      context,
    );
    logToConsole('warn', message);
  },
};

/**
 * Chat Analysis Logger
 * Logs all analysis-related operations
 */
export const chatAnalysisLogger = {
  /**
   * Log analysis creation
   */
  create: (roundNumber: number, context?: LogContext) => {
    if (!shouldLog('info'))
      return;

    const message = formatLogMessage(
      'info',
      'ChatAnalysis',
      'Creating pending analysis',
      { roundNumber, ...context },
    );
    logToConsole('info', message);
  },

  /**
   * Log analysis update
   */
  update: (roundNumber: number, status: string, context?: LogContext) => {
    if (!shouldLog('debug'))
      return;

    const message = formatLogMessage(
      'debug',
      'ChatAnalysis',
      'Analysis status updated',
      { roundNumber, status, ...context },
    );
    logToConsole('debug', message);
  },

  /**
   * Log analysis completion
   */
  complete: (roundNumber: number, context?: LogContext) => {
    if (!shouldLog('info'))
      return;

    const message = formatLogMessage(
      'info',
      'ChatAnalysis',
      'Analysis completed',
      { roundNumber, ...context },
    );
    logToConsole('info', message);
  },

  /**
   * Log analysis errors
   */
  error: (roundNumber: number, error: unknown, context?: LogContext) => {
    if (!shouldLog('error'))
      return;

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    const message = formatLogMessage(
      'error',
      'ChatAnalysis',
      'Analysis failed',
      { roundNumber, ...context, errorMessage, errorStack },
    );
    logToConsole('error', message, error);
  },
};

/**
 * General chat logger
 * Exports all specific loggers for convenience
 */
export const chatLogger = {
  context: chatContextLogger,
  overview: chatOverviewLogger,
  analysis: chatAnalysisLogger,
};
