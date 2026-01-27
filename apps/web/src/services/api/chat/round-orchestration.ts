/**
 * Round Orchestration Services - Backend-First Round Control
 *
 * Service for starting rounds with queue-based orchestration.
 * Used when web search is enabled to ensure presearch completes before participants.
 *
 * Per FLOW_DOCUMENTATION.md: Backend orchestrates the full flow:
 * START_ROUND → presearch → P0 → P1 → ... → moderator
 */

import type { UIMessage } from 'ai';

// ============================================================================
// TYPES
// ============================================================================

export type StartRoundRequest = {
  /** Thread ID */
  threadId: string;
  /** Round number (0-based) */
  roundNumber: number;
  /** User message in AI SDK UIMessage format */
  message: UIMessage;
  /** Optional attachment IDs */
  attachmentIds?: string[];
  /** Enable web search - if true, presearch will be triggered first */
  enableWebSearch?: boolean;
};

export type StartRoundResponse = {
  /** Status of the request */
  status: 'queued' | 'already_active';
  /** Thread ID */
  threadId: string;
  /** Round number */
  roundNumber: number;
};

export type StartRoundServiceOptions = {
  signal?: AbortSignal;
};

// ============================================================================
// START ROUND SERVICE
// ============================================================================

/**
 * Start a round with queue-based orchestration.
 *
 * Call this instead of triggering P0 directly when web search is enabled.
 * The backend queue will orchestrate: presearch → P0 → P1 → ... → moderator
 *
 * After calling this, subscribe to all entity streams via useRoundSubscription.
 *
 * @returns Response with status 202 Accepted
 */
export async function startRoundService(
  params: StartRoundRequest,
  options?: StartRoundServiceOptions,
): Promise<Response> {
  const url = new URL(
    `/api/v1/chat/threads/${params.threadId}/rounds/${params.roundNumber}/start`,
    typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8787',
  );

  return fetch(url.toString(), {
    body: JSON.stringify({
      attachmentIds: params.attachmentIds,
      enableWebSearch: params.enableWebSearch,
      message: params.message,
    }),
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: options?.signal,
  });
}
