/**
 * Conversation Flow Tracer
 *
 * Traces the full lifecycle of a conversation round to identify timing issues.
 * Enable via localStorage: localStorage.setItem('DEBUG_CONVERSATION', 'true')
 */

type EventType
  = | 'THREAD_CREATE'
    | 'PRE_SEARCH_START'
    | 'PRE_SEARCH_COMPLETE'
    | 'PARTICIPANT_START'
    | 'PARTICIPANT_STREAM'
    | 'PARTICIPANT_COMPLETE'
    | 'ROUND_COMPLETE'
    | 'SUMMARY_CREATE'
    | 'SUMMARY_COMPLETE'
    | 'STATE_CHANGE'
    | 'HYDRATION'
    | 'RESUMPTION'
    | 'ERROR';

type TraceEvent = {
  timestamp: number;
  elapsed: number;
  type: EventType;
  round: number | null;
  participant: number | null;
  data: Record<string, unknown>;
};

// Timeline storage
const timeline: TraceEvent[] = [];
let startTime: number | null = null;
let currentRound: number | null = null;

// Check if debug is enabled (client-side only)
function isEnabled(): boolean {
  if (typeof window === 'undefined')
    return false;
  return localStorage.getItem('DEBUG_CONVERSATION') === 'true';
}

/**
 * Start a new conversation trace
 */
export function traceStart(threadId: string, participantCount: number): void {
  if (!isEnabled())
    return;

  timeline.length = 0;
  startTime = Date.now();
  currentRound = 0;

  timeline.push({
    timestamp: startTime,
    elapsed: 0,
    type: 'THREAD_CREATE',
    round: 0,
    participant: null,
    data: { threadId, participantCount },
  });
}

/**
 * Log a trace event
 */
export function trace(
  type: EventType,
  data: Record<string, unknown> = {},
  participantIndex: number | null = null,
): void {
  if (!isEnabled())
    return;

  const now = Date.now();
  const elapsed = startTime ? now - startTime : 0;

  const event: TraceEvent = {
    timestamp: now,
    elapsed,
    type,
    round: currentRound,
    participant: participantIndex,
    data,
  };

  timeline.push(event);
}

/**
 * Log state change with before/after
 */
export function traceState(
  name: string,
  before: unknown,
  after: unknown,
): void {
  if (!isEnabled())
    return;

  trace('STATE_CHANGE', { name, before, after });
}

/**
 * Mark participant streaming start
 */
export function traceParticipantStart(
  participantIndex: number,
  modelId: string,
  roundNumber: number,
): void {
  if (!isEnabled())
    return;

  currentRound = roundNumber;
  trace('PARTICIPANT_START', { modelId, roundNumber }, participantIndex);
}

/**
 * Mark participant streaming complete
 */
export function traceParticipantComplete(
  participantIndex: number,
  modelId: string,
  finishReason: string,
  tokenCount: number,
): void {
  if (!isEnabled())
    return;

  trace('PARTICIPANT_COMPLETE', { modelId, finishReason, tokenCount }, participantIndex);
}

/**
 * Mark round complete
 */
export function traceRoundComplete(roundNumber: number, participantCount: number): void {
  if (!isEnabled())
    return;

  currentRound = roundNumber;
  trace('ROUND_COMPLETE', { roundNumber, participantCount });
}

/**
 * Set current round for subsequent traces
 */
export function setCurrentRound(round: number): void {
  currentRound = round;
}

/**
 * Get the full timeline for analysis
 */
export function getTimeline(): TraceEvent[] {
  return [...timeline];
}

/**
 * Print a summary of the timeline
 */
export function printTimelineSummary(): void {
  if (!isEnabled() || timeline.length === 0) {
    // No-op when disabled or empty
  }
}

/**
 * Export timeline as JSON for debugging
 */
export function exportTimeline(): string {
  return JSON.stringify(timeline, null, 2);
}

/**
 * Clear the timeline
 */
export function clearTimeline(): void {
  timeline.length = 0;
  startTime = null;
  currentRound = null;
}
