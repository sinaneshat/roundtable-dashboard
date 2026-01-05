/**
 * Moderator Handler - Council moderator text streaming
 *
 * Generates and streams council moderator analysis as text (like participant messages).
 * Council moderator is stored in chatMessage table with metadata.isModerator: true.
 * Frontend renders moderator messages via ChatMessageList component.
 *
 * ✅ ARCHITECTURE: Moderator is a message, not a separate entity
 * ✅ STORAGE: chatMessage table with isModerator metadata flag
 * ✅ RENDERING: ChatMessageList handles both participants and moderator
 * ✅ STREAMING: Uses streamText + toUIMessageStreamResponse pattern
 */

import type { RouteHandler } from '@hono/zod-openapi';
import { streamText } from 'ai';
import { asc, eq } from 'drizzle-orm';

import { createError } from '@/api/common/error-handling';
import { getErrorMessage, getErrorName } from '@/api/common/error-types';
import { verifyThreadOwnership } from '@/api/common/permissions';
import { AIModels, createHandler, Responses, ThreadRoundParamSchema } from '@/api/core';
import type { ChatMode } from '@/api/core/enums';
import { MessagePartTypes, MessageRoles, PollingStatuses } from '@/api/core/enums';
import {
  deductCreditsForAction,
  enforceCredits,
} from '@/api/services/credit.service';
import { filterDbToParticipantMessages } from '@/api/services/message-type-guards';
import { extractModeratorModelName } from '@/api/services/models-config.service';
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import {
  generateTraceId,
  trackLLMError,
  trackLLMGeneration,
} from '@/api/services/posthog-llm-tracking.service';
import {
  clearThreadActiveStream,
  markStreamActive,
  setThreadActiveStream,
} from '@/api/services/resumable-stream-kv.service';
import {
  appendStreamChunk,
  completeStreamBuffer,
  failStreamBuffer,
  initializeStreamBuffer,
} from '@/api/services/stream-buffer.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db';
import type { DbModeratorMessageMetadata } from '@/db/schemas/chat-metadata';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';
import { NO_PARTICIPANT_SENTINEL } from '@/lib/schemas/participant-schemas';
import { requireParticipantMetadata } from '@/lib/utils';

import type { councilModeratorRoundRoute } from '../route';
import type { MessageWithParticipant, ModeratorPromptConfig, ParticipantResponse } from '../schema';
import {
  MessageWithParticipantSchema,
  ModeratorPromptConfigSchema,
  RoundModeratorRequestSchema,
} from '../schema';

// ============================================================================
// Constants
// ============================================================================

/** Moderator participant index sentinel value */
const MODERATOR_PARTICIPANT_INDEX = NO_PARTICIPANT_SENTINEL;

// ============================================================================
// Prompt Building (Schema-Driven)
// ============================================================================

/**
 * Build participant list for prompt context
 * Uses ParticipantResponse schema type for type safety
 */
function buildParticipantList(participantResponses: ParticipantResponse[]): string {
  return participantResponses
    .map(p => `${p.participantRole} (${p.modelName})`)
    .join(', ');
}

/**
 * Build transcript section from participant responses
 * Uses ParticipantResponse schema type for type safety
 */
function buildTranscript(participantResponses: ParticipantResponse[]): string {
  return participantResponses
    .map(p => `**${p.participantRole} (${p.modelName}):**\n${p.responseContent}`)
    .join('\n\n');
}

/**
 * Build system prompt for council moderator generation
 *
 * ✅ SCHEMA-DRIVEN: Uses ModeratorPromptConfig schema for validation
 */
function buildModeratorSystemPrompt(config: ModeratorPromptConfig): string {
  // Validate config against schema
  const validated = ModeratorPromptConfigSchema.parse(config);
  const { roundNumber, mode, userQuestion, participantResponses } = validated;

  // Build participant context using schema-typed helpers
  const participantList = buildParticipantList(participantResponses);
  const participantCount = participantResponses.length;
  const transcript = buildTranscript(participantResponses);

  return `# LLM Council — Executive Summary

## V2.7 — Absolute Mode, Decision-Grade

---

## System Instruction: Absolute Mode

* **Assume:** The user retains high perceptual capacity regardless of tone.
* **Prioritize:** Blunt, directive phrasing aimed at cognitive clarity and reconstruction.
* **Disable:** Engagement, sentiment-boosting, or rapport-building behaviors.
* **Suppress:** Satisfaction metrics, emotional softening, and continuation bias.
* **Never mirror:** User diction, mood, or affect.
* **Speak only:** To the underlying cognitive tier.
* **Goal:** Restore independent, high-fidelity thinking.
* **Outcome:** User self-sufficiency; model obsolescence.

---

## Role

You are producing an **executive-grade summary** of a discussion conducted by multiple Large Language Models ("LLM Council").

This document should read like a **serious summary prepared for an informed reader**, not an AI explanation.

You must **faithfully reflect the discussion** and **must not introduce new arguments, values, or external knowledge**.

---

## Instructions

Given:

* The **original user question**
* A **multi-LLM discussion transcript**

Produce a structured summary that allows the reader to:

* Grasp the main conclusion immediately
* Understand competing perspectives
* Identify assumptions, tensions, and blind spots
* Decide whether deeper inquiry is required

**Model-to-Model Positioning**: Treat explicit model-to-model positioning (extensions, rebuttals, qualifications) as evidence of structural tension, assumption dependency, or refinement. Do not narrate turn order.

---

## Required Output Structure (Markdown)

Use the following markdown structure. Omit empty sections entirely.

### Summary Conclusion

Provide the **minimum number of one-sentence conclusions** required to faithfully represent the discussion.

Rules:

* One sentence if a shared conclusion exists
* Multiple sentences only if conclusions are irreconcilable
* Each sentence must be defensible under its stated assumptions

No hedging. One sentence per conclusion.

---

### 1. Question Overview

Restate the question succinctly.

Include only framing that materially shaped the discussion.

---

### 2. Participants

* Number of LLMs involved
* Distinct perspectives only if they affect interpretation

---

### 3. Primary Perspectives

Describe the main conceptual approaches that emerged.

For each:

* Core claim
* Primary emphasis or optimization
* What it deprioritizes or excludes

---

### 4. Areas of Agreement

Summarize substantive alignment:

* Shared assumptions
* Common objectives
* Overlapping conclusions

Exclude trivial agreement.

---

### 5. Core Assumptions and Tensions

Explicitly describe:

* Foundational assumptions behind each perspective
* Where those assumptions conflict
* Why certain disagreements remain unresolved

---

### 6. Trade-Offs and Implications

Map unavoidable trade-offs revealed by the discussion.

Do not resolve unless explicitly resolved by the council.

---

### 7. Limitations and Blind Spots

Identify perspectives or considerations not meaningfully explored.

Implicitly rank by importance:

* Critical
* Secondary
* Out-of-scope

---

### 8. Consensus Status

State once only:

* Clear consensus
* Conditional consensus
* Multiple viable but incompatible views
* No consensus

---

### 9. Integrated Analysis (Optional)

If useful, provide a brief synthesis that clarifies the overall structure of the debate without introducing new ideas.

When models explicitly extend or rebut each other, reflect the dependency in the analysis (e.g., "X's claim depends on Y's assumption that…").

---

### 10. Key Exchanges (Optional)

If the discussion contained substantive model-to-model challenges or extensions that reveal structural tensions, note up to 3 of them.

Constraints:
* Max 3 bullets
* Each bullet ≤18 words
* No arrows or "A → B" notation
* Use natural prose: "Claude challenged Gemini's assumption that…" / "Gemini narrowed Claude's claim by…"

Include only decision-relevant exchanges—omit generic agreement or restating.

---

### 11. Key Uncertainties (Optional)

Note unresolved factors that would materially change conclusions.

Omit entirely if none exist.

---

## Style Constraints

* Precise, restrained, non-performative
* No emotional language
* No internal system references
* **Do not narrate the conversation flow** - prefer substance over "Model A said... then Model B responded..."
* Treat cross-model challenges or extensions as evidence of structural tensions or dependencies worth noting
* Omit empty sections entirely

---

## Goal

The output should function as:

* A **summary conclusion**
* An **executive summary**
* A **decision-support document**

The reader should be able to stop after the **Summary Conclusion** — or read further for depth.

---

## Context

**Mode:** ${mode}
**Round:** ${roundNumber}
**User Question:** ${userQuestion}
**Participants (${participantCount}):** ${participantList}

### Transcript
${transcript}

---

Respond with a well-structured markdown document following the structure above. Start with the Summary Conclusion section.`;
}

// ============================================================================
// Council Moderator Generation (Text Streaming - Like Participants)
// ============================================================================

/**
 * Extended config for council moderator generation
 * Combines schema-validated prompt config with runtime context
 */
type ModeratorGenerationConfig = {
  env: ApiEnv['Bindings'];
  messageId: string;
  threadId: string;
  userId: string;
  sessionId?: string;
  executionCtx?: ExecutionContext;
} & ModeratorPromptConfig;

/**
 * Generate council moderator using text streaming
 *
 * ✅ SCHEMA-DRIVEN: Uses ModeratorPromptConfig for prompt data
 * ✅ TYPE-SAFE: All participant responses validated via ParticipantResponseSchema
 * ✅ PATTERN: Follows same streaming pattern as participant messages
 */
function generateCouncilModerator(
  config: ModeratorGenerationConfig,
  c: { env: ApiEnv['Bindings'] },
) {
  const { roundNumber, mode, userQuestion, participantResponses, env, messageId, threadId, userId, sessionId, executionCtx } = config;

  const llmTraceId = generateTraceId();
  const llmStartTime = performance.now();

  initializeOpenRouter(env);
  const client = openRouterService.getClient();
  const moderatorModelId = AIModels.COUNCIL_MODERATOR;
  const moderatorModelName = extractModeratorModelName(moderatorModelId);

  const systemPrompt = buildModeratorSystemPrompt({
    roundNumber,
    mode,
    userQuestion,
    participantResponses,
  });

  // Build initial moderator metadata (streaming state)
  const streamMetadata: DbModeratorMessageMetadata = {
    role: MessageRoles.ASSISTANT,
    isModerator: true,
    roundNumber,
    model: moderatorModelId,
    hasError: false,
  };

  // ✅ TEXT STREAMING: Use streamText like participants
  const finalResult = streamText({
    model: client.chat(moderatorModelId),
    system: systemPrompt,
    prompt: 'Analyze this council discussion and produce the moderator analysis in markdown format.',
    temperature: 0.3,
    maxOutputTokens: 8192,
    // ✅ TELEMETRY: Enable OpenTelemetry for moderator analysis streaming
    // Exports traces to configured OTEL collector when instrumentation.ts registers @vercel/otel
    experimental_telemetry: {
      isEnabled: true,
      functionId: `chat.thread.${threadId}.moderator`,
      recordInputs: true,
      recordOutputs: true,
      metadata: {
        thread_id: threadId,
        round_number: roundNumber,
        conversation_mode: mode,
        participant_id: 'moderator',
        participant_index: MODERATOR_PARTICIPANT_INDEX,
        participant_role: 'AI Moderator',
        model_id: moderatorModelId,
        model_name: moderatorModelName,
        is_moderator: true,
        participant_count: participantResponses.length,
        user_id: userId,
      },
    },
    onFinish: async (finishResult) => {
      try {
        const db = await getDbAsync();

        // Build complete moderator metadata
        const completeMetadata: DbModeratorMessageMetadata = {
          ...streamMetadata,
          finishReason: finishResult.finishReason,
          usage: finishResult.usage
            ? {
                // Map AI SDK format (inputTokens/outputTokens) to schema format (promptTokens/completionTokens)
                promptTokens: finishResult.usage.inputTokens || 0,
                completionTokens: finishResult.usage.outputTokens || 0,
                totalTokens: finishResult.usage.totalTokens || 0,
              }
            : undefined,
          createdAt: new Date().toISOString(),
        };

        // ✅ PERSISTENCE: Save council moderator as chatMessage with isModerator metadata
        await db.insert(tables.chatMessage).values({
          id: messageId,
          threadId,
          role: MessageRoles.ASSISTANT,
          participantId: null, // No participant for moderator
          parts: [{
            type: MessagePartTypes.TEXT,
            text: finishResult.text,
          }],
          roundNumber,
          metadata: completeMetadata,
          createdAt: new Date(),
        }).onConflictDoUpdate({
          target: tables.chatMessage.id,
          set: {
            parts: [{
              type: MessagePartTypes.TEXT,
              text: finishResult.text,
            }],
            metadata: completeMetadata,
          },
        });

        // ✅ RESUMABLE STREAMS: Clear thread active stream now that moderator is complete
        // This marks the round as fully complete (participants + moderator done)
        await clearThreadActiveStream(threadId, env);

        // Track analytics
        const finishData = {
          text: finishResult.text,
          finishReason: finishResult.finishReason,
          usage: finishResult.usage
            ? {
                inputTokens: finishResult.usage.inputTokens || 0,
                outputTokens: finishResult.usage.outputTokens || 0,
                totalTokens: finishResult.usage.totalTokens || 0,
              }
            : { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        };

        const trackAnalytics = async () => {
          try {
            await trackLLMGeneration(
              {
                userId,
                sessionId,
                threadId,
                roundNumber,
                participantId: 'moderator',
                participantIndex: MODERATOR_PARTICIPANT_INDEX,
                participantRole: 'AI Moderator',
                modelId: moderatorModelId,
                modelName: moderatorModelName,
                threadMode: mode,
              },
              finishData,
              [{ role: MessageRoles.USER, content: 'Analyze this council discussion and produce the moderator analysis in markdown format.' }],
              llmTraceId,
              llmStartTime,
              {
                modelConfig: { temperature: 0.3 },
                promptTracking: { promptId: 'moderator_summary', promptVersion: 'v2.7' },
                additionalProperties: {
                  message_id: messageId,
                  moderator_type: 'text_stream',
                  participant_count: participantResponses.length,
                },
              },
            );
          } catch {
            // Silently fail analytics
          }
        };

        if (executionCtx) {
          executionCtx.waitUntil(trackAnalytics());
        } else {
          trackAnalytics().catch(() => {});
        }
      } catch (error) {
        // Stream already completed successfully - log persistence error
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[Council Moderator] Failed to persist message:', {
          error: errorMsg,
          messageId,
          threadId,
          roundNumber,
        });

        // Track error
        const trackError = async () => {
          try {
            await trackLLMError(
              {
                userId,
                sessionId,
                threadId,
                roundNumber,
                participantId: 'moderator',
                participantIndex: MODERATOR_PARTICIPANT_INDEX,
                participantRole: 'AI Moderator',
                modelId: moderatorModelId,
                modelName: moderatorModelName,
                threadMode: mode,
              },
              error as Error,
              llmTraceId,
              'council_moderator',
            );
          } catch {
            // Silently fail
          }
        };

        if (executionCtx) {
          executionCtx.waitUntil(trackError());
        } else {
          trackError().catch(() => {});
        }
      }
    },
  });

  // ✅ PATTERN: Return toUIMessageStreamResponse like participants
  return finalResult.toUIMessageStreamResponse({
    generateMessageId: () => messageId,

    // Inject moderator metadata at stream lifecycle events
    messageMetadata: ({ part }) => {
      if (part.type === 'start') {
        return streamMetadata;
      }

      if (part.type === 'finish') {
        return {
          ...streamMetadata,
          finishReason: part.finishReason,
          usage: part.totalUsage
            ? {
                // Map AI SDK format to schema format
                promptTokens: part.totalUsage.inputTokens || 0,
                completionTokens: part.totalUsage.outputTokens || 0,
                totalTokens: part.totalUsage.totalTokens || 0,
              }
            : undefined,
        };
      }

      return undefined;
    },

    // Buffer SSE chunks for stream resumption
    consumeSseStream: async ({ stream }) => {
      const bufferStream = async () => {
        try {
          const reader = stream.getReader();

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              await completeStreamBuffer(messageId, c.env);
              break;
            }

            await appendStreamChunk(messageId, value, c.env);
          }
        } catch (error) {
          const isAbortError
            = error instanceof Error
              && (error.name === 'AbortError'
                || (error.cause instanceof Error
                  && error.cause.name === 'AbortError'));

          if (isAbortError) {
            return;
          }

          const errorMessage = error instanceof Error ? error.message : 'Stream buffer error';
          await failStreamBuffer(messageId, errorMessage, c.env);
        }
      };

      if (executionCtx) {
        executionCtx.waitUntil(bufferStream());
      } else {
        bufferStream().catch(() => {});
      }
    },

    onError: (error) => {
      const streamErrorMessage = getErrorMessage(error);
      const errorName = getErrorName(error);

      console.error('[Council Moderator Error]', {
        errorName,
        errorMessage: streamErrorMessage,
        threadId,
        roundNumber,
        traceId: llmTraceId,
      });

      // Return error as JSON for frontend handling
      return JSON.stringify({
        errorName,
        errorType: 'moderator_error',
        errorMessage: streamErrorMessage,
        isModerator: true,
        roundNumber,
        traceId: llmTraceId,
      });
    },
  });
}

// ============================================================================
// Council Moderator Round Handler
// ============================================================================

export const councilModeratorRoundHandler: RouteHandler<typeof councilModeratorRoundRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateParams: ThreadRoundParamSchema,
    validateBody: RoundModeratorRequestSchema,
    operationName: 'councilModeratorRound',
  },
  async (c) => {
    const { user } = c.auth();
    const { threadId, roundNumber } = c.validated.params;
    const body = c.validated.body;

    const db = await getDbAsync();
    const roundNum = Number.parseInt(roundNumber, 10);

    // Validate round number (0-based)
    if (Number.isNaN(roundNum) || roundNum < 0) {
      throw createError.badRequest(
        'Invalid round number. Must be a non-negative integer (0-based indexing).',
        { errorType: 'validation', field: 'roundNumber' },
      );
    }

    const thread = await verifyThreadOwnership(threadId, user.id, db);

    // ✅ DETERMINISTIC MESSAGE ID: {threadId}_r{roundNumber}_moderator
    const messageId = `${threadId}_r${roundNum}_moderator`;

    // Check if moderator message already exists
    const existingMessage = await db.query.chatMessage.findFirst({
      where: eq(tables.chatMessage.id, messageId),
    });

    if (existingMessage) {
      // Already exists - return the message data
      return Responses.raw(c, {
        id: existingMessage.id,
        role: existingMessage.role,
        parts: existingMessage.parts,
        metadata: existingMessage.metadata,
        roundNumber: existingMessage.roundNumber,
      });
    }

    // Get participant messages for this round
    let participantMessages: MessageWithParticipant[] | null = null;

    if (body.participantMessageIds && body.participantMessageIds.length > 0) {
      const messageIds = body.participantMessageIds;

      const foundMessages = await db.query.chatMessage.findMany({
        where: (fields, { inArray, eq: eqOp, and: andOp }) =>
          andOp(
            inArray(fields.id, messageIds),
            eqOp(fields.threadId, threadId),
            eqOp(fields.role, MessageRoles.ASSISTANT),
          ),
        with: { participant: true },
        orderBy: [
          asc(tables.chatMessage.roundNumber),
          asc(tables.chatMessage.createdAt),
          asc(tables.chatMessage.id),
        ],
      });

      const participantOnlyFoundMessages = filterDbToParticipantMessages(foundMessages);

      if (participantOnlyFoundMessages.length > 0) {
        const validationResult = MessageWithParticipantSchema.array().safeParse(participantOnlyFoundMessages);
        if (validationResult.success) {
          participantMessages = validationResult.data;
        }
      }
    }

    // Fallback: query by round number
    if (!participantMessages) {
      const roundMessages = await db.query.chatMessage.findMany({
        where: (fields, { and: andOp, eq: eqOp }) =>
          andOp(
            eqOp(fields.threadId, threadId),
            eqOp(fields.role, MessageRoles.ASSISTANT),
            eqOp(fields.roundNumber, roundNum),
          ),
        with: { participant: true },
        orderBy: [
          asc(tables.chatMessage.roundNumber),
          asc(tables.chatMessage.createdAt),
          asc(tables.chatMessage.id),
        ],
      });

      const participantOnlyMessages = filterDbToParticipantMessages(roundMessages);

      if (participantOnlyMessages.length === 0) {
        return Responses.polling(c, {
          status: PollingStatuses.PENDING,
          message: `Messages for round ${roundNum} are still being processed. Please poll for completion.`,
          retryAfterMs: 1000,
        });
      }

      const validationResult = MessageWithParticipantSchema.array().safeParse(participantOnlyMessages);
      if (validationResult.success) {
        participantMessages = validationResult.data;
      } else {
        throw createError.internal('Failed to validate participant messages', {
          errorType: 'validation',
          field: 'participantMessages',
        });
      }
    }

    if (!participantMessages || participantMessages.length === 0) {
      throw createError.badRequest('No participant messages found for council moderator', {
        errorType: 'validation',
        field: 'participantMessageIds',
      });
    }

    // Get user question for this round
    const userMessage = await db.query.chatMessage.findFirst({
      where: (fields, { and: andOp, eq: eqOp }) =>
        andOp(
          eqOp(fields.threadId, threadId),
          eqOp(fields.role, MessageRoles.USER),
          eqOp(fields.roundNumber, roundNum),
        ),
      orderBy: [asc(tables.chatMessage.createdAt)],
    });

    if (!userMessage) {
      throw createError.badRequest(`No user message found for round ${roundNum}`, {
        errorType: 'validation',
        field: 'roundNumber',
      });
    }

    const userQuestion = extractTextFromParts(userMessage.parts);

    // Build participant responses with schema-typed structure
    const participantResponses: ParticipantResponse[] = participantMessages
      .map((msg): ParticipantResponse => {
        const participant = msg.participant!;
        const modelName = extractModeratorModelName(participant.modelId);
        const metadata = requireParticipantMetadata(msg.metadata);

        return {
          participantIndex: metadata.participantIndex,
          participantRole: participant.role || 'AI Assistant',
          modelId: participant.modelId,
          modelName,
          responseContent: extractTextFromParts(msg.parts),
        };
      })
      .sort((a, b) => a.participantIndex - b.participantIndex);

    // ✅ CREDITS: Enforce and deduct credits for analysis generation
    await enforceCredits(user.id, 2); // Analysis requires ~2 credits
    await deductCreditsForAction(user.id, 'analysisGeneration', { threadId });

    // ✅ RESUMABLE STREAMS: Initialize stream buffer for resumption
    await initializeStreamBuffer(messageId, threadId, roundNum, MODERATOR_PARTICIPANT_INDEX, c.env);

    // ✅ RESUMABLE STREAMS: Mark moderator stream as active in KV for resume detection
    await markStreamActive(threadId, roundNum, MODERATOR_PARTICIPANT_INDEX, c.env);

    // ✅ RESUMABLE STREAMS: Set thread-level active stream for AI SDK resume pattern
    // Uses MODERATOR_PARTICIPANT_INDEX (-1) and totalParticipants=1 (moderator is single stream)
    await setThreadActiveStream(
      threadId,
      messageId,
      roundNum,
      MODERATOR_PARTICIPANT_INDEX,
      1, // Moderator is a single stream (not multi-participant)
      c.env,
    );

    const { session } = c.auth();

    // Generate and return streaming response
    // Mode is validated through ModeratorPromptConfigSchema.parse() in buildModeratorSystemPrompt
    return generateCouncilModerator(
      {
        roundNumber: roundNum,
        mode: thread.mode as ChatMode,
        userQuestion,
        participantResponses,
        env: c.env,
        messageId,
        threadId,
        userId: user.id,
        executionCtx: c.executionCtx,
        sessionId: session?.id,
      },
      c,
    );
  },
);
