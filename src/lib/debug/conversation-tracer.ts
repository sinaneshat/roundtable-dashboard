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

  // eslint-disable-next-line no-console
  console.log(
    `%c[TRACE] THREAD_CREATE %c+0ms`,
    'color: #4CAF50; font-weight: bold',
    'color: #888',
    { threadId, participantCount },
  );
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

  // Color coding by event type
  const colors: Record<EventType, string> = {
    THREAD_CREATE: '#4CAF50',
    PRE_SEARCH_START: '#2196F3',
    PRE_SEARCH_COMPLETE: '#2196F3',
    PARTICIPANT_START: '#FF9800',
    PARTICIPANT_STREAM: '#FFC107',
    PARTICIPANT_COMPLETE: '#FF9800',
    ROUND_COMPLETE: '#9C27B0',
    SUMMARY_CREATE: '#E91E63',
    SUMMARY_COMPLETE: '#E91E63',
    STATE_CHANGE: '#607D8B',
    HYDRATION: '#00BCD4',
    RESUMPTION: '#795548',
    ERROR: '#F44336',
  };

  const participantStr = participantIndex !== null ? ` P${participantIndex}` : '';
  const roundStr = currentRound !== null ? `R${currentRound}` : '';

  // eslint-disable-next-line no-console
  console.log(
    `%c[TRACE] ${type} %c${roundStr}${participantStr} %c+${elapsed}ms`,
    `color: ${colors[type]}; font-weight: bold`,
    'color: #666',
    'color: #888',
    data,
  );
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
  if (!isEnabled() || timeline.length === 0)
    return;

  // eslint-disable-next-line no-console
  console.log('\n%c=== CONVERSATION TIMELINE SUMMARY ===', 'color: #4CAF50; font-weight: bold; font-size: 14px');

  const rounds = new Map<number, TraceEvent[]>();
  for (const event of timeline) {
    const round = event.round ?? 0;
    if (!rounds.has(round))
      rounds.set(round, []);
    rounds.get(round)!.push(event);
  }

  for (const [round, events] of rounds) {
    // eslint-disable-next-line no-console
    console.log(`\n%cRound ${round}:`, 'color: #2196F3; font-weight: bold');

    const participantStarts = events.filter(e => e.type === 'PARTICIPANT_START');
    const participantCompletes = events.filter(e => e.type === 'PARTICIPANT_COMPLETE');

    // eslint-disable-next-line no-console
    console.log(`  Participants started: ${participantStarts.length}`);
    // eslint-disable-next-line no-console
    console.log(`  Participants completed: ${participantCompletes.length}`);

    // Check for issues
    if (participantStarts.length !== participantCompletes.length) {
      // eslint-disable-next-line no-console
      console.log(`  %c!! MISMATCH: ${participantStarts.length} started vs ${participantCompletes.length} completed`, 'color: #F44336');
    }

    const roundComplete = events.find(e => e.type === 'ROUND_COMPLETE');
    if (!roundComplete && participantCompletes.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`  %c!! MISSING: Round complete event`, 'color: #F44336');
    }
  }

  // eslint-disable-next-line no-console
  console.log('\n%c=== END SUMMARY ===\n', 'color: #4CAF50; font-weight: bold');
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
