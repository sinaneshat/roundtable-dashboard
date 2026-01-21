/**
 * Testing Enums - 5-Part Pattern
 *
 * Enum definitions for testing utilities following project type-inference patterns.
 * Location: src/lib/testing/enums.ts
 */

import { z } from 'zod';

// ============================================================================
// TEST CALL TYPES ENUM (5-Part Pattern)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for test call type values
export const TEST_CALL_TYPES = [
  'rapid-call',
  'submit-message',
  'start-streaming',
  'stop-streaming',
  'trigger-moderator',
  'moderator-complete',
  'pre-search-execute',
  'slug-polling',
  'slug-polling-start',
  'slug-poll',
  'url-replace',
  'router-push',
  'participant-0-complete',
  'participant-1-complete',
  'effect-run',
  'timeout-callback',
  'subscription-callback',
  'messages-reference-changed-unrelated',
  'messages-reference-changed-update',
  'setMessages',
  'setStreamingRoundNumber',
  'debounced-call',
  'throttled-call',
  'moderator-create',
] as const;

// 2️⃣ ZOD SCHEMA - Runtime validation
export const TestCallTypeSchema = z.enum(TEST_CALL_TYPES);

// 3️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type TestCallType = z.infer<typeof TestCallTypeSchema>;

// 4️⃣ DEFAULT VALUE
export const DEFAULT_TEST_CALL_TYPE: TestCallType = 'rapid-call';

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const TestCallTypes = {
  RAPID_CALL: 'rapid-call' as const,
  SUBMIT_MESSAGE: 'submit-message' as const,
  START_STREAMING: 'start-streaming' as const,
  STOP_STREAMING: 'stop-streaming' as const,
  TRIGGER_MODERATOR: 'trigger-moderator' as const,
  MODERATOR_COMPLETE: 'moderator-complete' as const,
  PRE_SEARCH_EXECUTE: 'pre-search-execute' as const,
  SLUG_POLLING: 'slug-polling' as const,
  SLUG_POLLING_START: 'slug-polling-start' as const,
  SLUG_POLL: 'slug-poll' as const,
  URL_REPLACE: 'url-replace' as const,
  ROUTER_PUSH: 'router-push' as const,
  PARTICIPANT_0_COMPLETE: 'participant-0-complete' as const,
  PARTICIPANT_1_COMPLETE: 'participant-1-complete' as const,
  EFFECT_RUN: 'effect-run' as const,
  TIMEOUT_CALLBACK: 'timeout-callback' as const,
  SUBSCRIPTION_CALLBACK: 'subscription-callback' as const,
  MESSAGES_REFERENCE_CHANGED_UNRELATED: 'messages-reference-changed-unrelated' as const,
  MESSAGES_REFERENCE_CHANGED_UPDATE: 'messages-reference-changed-update' as const,
  SET_MESSAGES: 'setMessages' as const,
  SET_STREAMING_ROUND_NUMBER: 'setStreamingRoundNumber' as const,
  DEBOUNCED_CALL: 'debounced-call' as const,
  THROTTLED_CALL: 'throttled-call' as const,
  MODERATOR_CREATE: 'moderator-create' as const,
} as const;
