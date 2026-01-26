/**
 * Entity Subscription Services - Backend-First Streaming Architecture
 *
 * Pure subscriber services for entity-specific stream subscriptions.
 * Per FLOW_DOCUMENTATION.md: Backend is orchestrator/publisher, frontend is pure subscriber.
 *
 * Each entity (presearch, participant, moderator) has its own stream subscription endpoint
 * that supports resumption via lastSeq parameter.
 */

// ============================================================================
// TYPES
// ============================================================================

export type EntitySubscriptionStatus = 'waiting' | 'complete' | 'error' | 'disabled';

export type EntitySubscriptionResponse = {
  /** Status of the stream */
  status: EntitySubscriptionStatus;
  /** Last sequence number received (for resumption) */
  lastSeq?: number;
  /** Retry delay in ms (when status is 'waiting') */
  retryAfter?: number;
  /** Message (e.g., 'Web search not enabled for this thread') */
  message?: string;
  /** Participant index (for participant streams) */
  participantIndex?: number;
};

export type SubscribeToPreSearchStreamParams = {
  threadId: string;
  roundNumber: number;
  lastSeq?: number;
};

export type SubscribeToParticipantStreamParams = {
  threadId: string;
  roundNumber: number;
  participantIndex: number;
  lastSeq?: number;
};

export type SubscribeToModeratorStreamParams = {
  threadId: string;
  roundNumber: number;
  lastSeq?: number;
};

export type EntitySubscriptionServiceOptions = {
  signal?: AbortSignal;
};

// ============================================================================
// PRESEARCH SUBSCRIPTION SERVICE
// ============================================================================

/**
 * Subscribe to pre-search stream for a specific round.
 *
 * Returns:
 * - Response with status 202: Stream not started yet (check retryAfter)
 * - Response with status 200 + JSON: Stream complete/error/disabled
 * - Response with status 200 + SSE: Active stream (text/event-stream)
 */
export async function subscribeToPreSearchStreamService(
  params: SubscribeToPreSearchStreamParams,
  options?: EntitySubscriptionServiceOptions,
): Promise<Response> {
  const url = new URL(
    `/api/v1/chat/threads/${params.threadId}/rounds/${params.roundNumber}/stream/presearch`,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787',
  );

  if (params.lastSeq !== undefined && params.lastSeq > 0) {
    url.searchParams.set('lastSeq', String(params.lastSeq));
  }

  return fetch(url.toString(), {
    credentials: 'include',
    headers: { Accept: 'text/event-stream, application/json' },
    signal: options?.signal,
  });
}

// ============================================================================
// PARTICIPANT SUBSCRIPTION SERVICE
// ============================================================================

/**
 * Subscribe to participant stream for a specific round and participant index.
 *
 * Returns:
 * - Response with status 202: Stream not started yet (check retryAfter)
 * - Response with status 200 + JSON: Stream complete/error
 * - Response with status 200 + SSE: Active stream (text/event-stream)
 */
export async function subscribeToParticipantStreamService(
  params: SubscribeToParticipantStreamParams,
  options?: EntitySubscriptionServiceOptions,
): Promise<Response> {
  const url = new URL(
    `/api/v1/chat/threads/${params.threadId}/rounds/${params.roundNumber}/stream/participant/${params.participantIndex}`,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787',
  );

  if (params.lastSeq !== undefined && params.lastSeq > 0) {
    url.searchParams.set('lastSeq', String(params.lastSeq));
  }

  return fetch(url.toString(), {
    credentials: 'include',
    headers: { Accept: 'text/event-stream, application/json' },
    signal: options?.signal,
  });
}

// ============================================================================
// MODERATOR SUBSCRIPTION SERVICE
// ============================================================================

/**
 * Subscribe to moderator stream for a specific round.
 *
 * Returns:
 * - Response with status 202: Stream not started yet (check retryAfter)
 * - Response with status 200 + JSON: Stream complete/error
 * - Response with status 200 + SSE: Active stream (text/event-stream)
 */
export async function subscribeToModeratorStreamService(
  params: SubscribeToModeratorStreamParams,
  options?: EntitySubscriptionServiceOptions,
): Promise<Response> {
  const url = new URL(
    `/api/v1/chat/threads/${params.threadId}/rounds/${params.roundNumber}/stream/moderator`,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787',
  );

  if (params.lastSeq !== undefined && params.lastSeq > 0) {
    url.searchParams.set('lastSeq', String(params.lastSeq));
  }

  return fetch(url.toString(), {
    credentials: 'include',
    headers: { Accept: 'text/event-stream, application/json' },
    signal: options?.signal,
  });
}
