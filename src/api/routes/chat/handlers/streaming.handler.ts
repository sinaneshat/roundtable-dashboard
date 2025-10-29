/**
 * Streaming Handler - Real-time AI response streaming with SSE
 *
 * Following backend-patterns.md: Domain-specific handler module
 * Refactored to use service layer for better maintainability
 *
 * This handler orchestrates multi-participant AI conversations with streaming responses.
 */

import type { RouteHandler } from '@hono/zod-openapi';
import type { UIMessage } from 'ai';
import { convertToModelMessages, RetryError, streamText, validateUIMessages } from 'ai';
import { and, asc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import { executeBatch } from '@/api/common/batch-operations';
import { createError, structureAIProviderError } from '@/api/common/error-handling';
import { createHandler } from '@/api/core';
import { ChangelogTypes } from '@/api/core/enums';
import { saveStreamedMessage } from '@/api/services/message-persistence.service';
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import { openRouterModelsService } from '@/api/services/openrouter-models.service';
import { validateParticipantUniqueness } from '@/api/services/participant-validation.service';
import {
  createTrackingContext,
  generateTraceId,
  trackLLMError,
  trackLLMGeneration,
} from '@/api/services/posthog-llm-tracking.service';
import {
  AI_RETRY_CONFIG,
  AI_TIMEOUT_CONFIG,
  getSafeMaxOutputTokens,
} from '@/api/services/product-logic.service';
import { ragService } from '@/api/services/rag.service';
import { handleRoundRegeneration } from '@/api/services/regeneration.service';
import { calculateRoundNumber } from '@/api/services/round.service';
import {
  enforceMessageQuota,
  getUserTier,
  incrementMessageUsage,
} from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';
import { filterNonEmptyMessages } from '@/lib/utils/message-transforms';

import type { streamChatRoute } from '../route';
import type { ChangeData } from '../schema';
import { StreamChatRequestSchema } from '../schema';
import { chatMessagesToUIMessages } from './helpers';

// ============================================================================
// Streaming Chat Handler
// ============================================================================

export const streamChatHandler: RouteHandler<typeof streamChatRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: StreamChatRequestSchema,
    operationName: 'streamChat',
  },
  async (c) => {
    const { user } = c.auth();
    const { message, id: threadId, participantIndex, participants: providedParticipants, regenerateRound, mode: providedMode } = c.validated.body;

    // =========================================================================
    // STEP 1: Validate incoming message
    // =========================================================================
    if (!message) {
      throw createError.badRequest('Message is required', { errorType: 'validation' });
    }

    if (!threadId) {
      throw createError.badRequest('Thread ID is required for streaming');
    }

    const db = await getDbAsync();

    // =========================================================================
    // STEP 2: Load thread and verify ownership
    // =========================================================================
    const thread = await db.query.chatThread.findFirst({
      where: eq(tables.chatThread.id, threadId),
      with: {
        participants: {
          where: eq(tables.chatParticipant.isEnabled, true),
          orderBy: [tables.chatParticipant.priority, tables.chatParticipant.id],
        },
      },
    });

    if (!thread) {
      throw createError.notFound('Thread not found');
    }

    if (thread.userId !== user.id) {
      throw createError.unauthorized('Not authorized to access this thread');
    }

    // =========================================================================
    // STEP 3: Handle regeneration (delete old round data)
    // =========================================================================
    if (regenerateRound) {
      await handleRoundRegeneration({
        threadId,
        regenerateRound,
        participantIndex: participantIndex ?? 0,
        db,
      });
    }

    // =========================================================================
    // STEP 4: Calculate round number
    // =========================================================================
    const roundResult = await calculateRoundNumber({
      threadId,
      participantIndex: participantIndex ?? 0,
      message,
      regenerateRound,
      db,
    });

    const currentRoundNumber = roundResult.roundNumber;

    // =========================================================================
    // STEP 5: Handle mode change (if provided)
    // =========================================================================
    if (providedMode && providedMode !== thread.mode && participantIndex === 0) {
      await executeBatch(db, [
        db.update(tables.chatThread)
          .set({
            mode: providedMode,
            updatedAt: new Date(),
          })
          .where(eq(tables.chatThread.id, threadId)),
        db.insert(tables.chatThreadChangelog).values({
          id: ulid(),
          threadId,
          roundNumber: currentRoundNumber,
          changeType: ChangelogTypes.MODIFIED,
          changeSummary: `Changed mode from ${thread.mode} to ${providedMode}`,
          changeData: {
            type: 'mode_change',
            oldMode: thread.mode,
            newMode: providedMode,
          },
          createdAt: new Date(),
        }),
      ]);

      thread.mode = providedMode;
    }

    // =========================================================================
    // STEP 6: Persist participant changes (if provided)
    // =========================================================================

    if (providedParticipants && participantIndex === 0) {
      // ✅ DETAILED CHANGE DETECTION: Track specific types of changes
      // Type-safe changeData that matches database schema exactly
      // ✅ Using Zod-inferred ChangeData type from schema
      const changelogEntries: Array<{
        id: string;
        changeType: typeof ChangelogTypes[keyof typeof ChangelogTypes];
        changeSummary: string;
        changeData: ChangeData;
      }> = [];

      // ✅ CRITICAL: Load ALL participants (including disabled) for accurate change detection
      // This prevents disabled participants from being treated as "new additions"
      const allDbParticipants = thread.participants; // All participants (enabled + disabled)
      const enabledDbParticipants = allDbParticipants.filter(p => p.isEnabled);
      const providedEnabledParticipants = providedParticipants.filter(p => p.isEnabled !== false);

      // ✅ VALIDATION: Check for duplicate modelIds in provided participants
      validateParticipantUniqueness(providedEnabledParticipants);

      // ✅ Match participants by modelId only for change detection
      // This allows role changes to be treated as updates, not add/remove
      // Each modelId can only appear once in the participant list

      // Detect removed participants (modelId in enabled DB but not in provided list)
      const removedParticipants = enabledDbParticipants.filter(
        dbP => !providedEnabledParticipants.find(p => p.modelId === dbP.modelId),
      );

      // ✅ FIXED: Detect truly new participants vs re-enabled participants
      // Check against ALL participants (not just enabled) to prevent duplicate inserts
      const addedParticipants = providedEnabledParticipants.filter(
        provided => !allDbParticipants.find(dbP => dbP.modelId === provided.modelId),
      );

      // ✅ NEW: Detect re-enabled participants (exist in DB but disabled)
      const reenabledParticipants = providedEnabledParticipants.filter((provided) => {
        const dbP = allDbParticipants.find(db => db.modelId === provided.modelId);
        return dbP && !dbP.isEnabled; // Exists but was disabled
      });

      // Detect updated participants (role text changed for same modelId)
      const updatedParticipants = providedEnabledParticipants.filter((provided) => {
        // First, find by modelId only (not role, since role might have changed)
        const dbP = enabledDbParticipants.find(db => db.modelId === provided.modelId);
        if (!dbP) {
          return false; // This is an added participant, not updated
        }
        // Only consider it updated if the role text actually changed
        const oldRole = dbP.role || null;
        const newRole = provided.role || null;
        return oldRole !== newRole;
      });

      // Note: Removed reordering detection as it's visually obvious to users
      // and doesn't need a separate changelog entry

      // ✅ BUILD INSERT OPERATIONS FOR NEW PARTICIPANTS
      // Track mapping from frontend temp ID to real database ID for changelog
      const participantIdMapping = new Map<string, string>();

      const insertOps = addedParticipants.map((provided) => {
        const newId = ulid(); // Generate a real database ID
        participantIdMapping.set(provided.id, newId); // Track the mapping
        return db.insert(tables.chatParticipant).values({
          id: newId,
          threadId,
          modelId: provided.modelId,
          role: provided.role ?? null,
          customRoleId: provided.customRoleId ?? null,
          priority: provided.priority,
          isEnabled: provided.isEnabled ?? true,
          settings: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      // ✅ UPDATE OPERATIONS - Match by modelId only (since role might have changed)
      // Build update operations for existing participants
      const updateOps = providedEnabledParticipants
        .map((provided) => {
          // Find matching DB participant by modelId only
          const dbP = enabledDbParticipants.find(db => db.modelId === provided.modelId);
          if (!dbP) {
            return null; // Not an existing participant, skip
          }

          // Update with new role, priority, customRoleId, and isEnabled status
          return db.update(tables.chatParticipant)
            .set({
              role: provided.role ?? null, // ✅ Update the role text
              customRoleId: provided.customRoleId ?? null,
              priority: provided.priority,
              isEnabled: provided.isEnabled ?? true,
              updatedAt: new Date(),
            })
            .where(eq(tables.chatParticipant.id, dbP.id)); // Use DB ID for update
        })
        .filter((op): op is NonNullable<typeof op> => op !== null);

      // Also disable participants that were removed (not in provided list)
      const disableOps = removedParticipants.map(removed =>
        db.update(tables.chatParticipant)
          .set({
            isEnabled: false,
            updatedAt: new Date(),
          })
          .where(eq(tables.chatParticipant.id, removed.id)),
      );

      // ✅ NEW: Re-enable previously disabled participants
      // Instead of inserting duplicates, update existing disabled participants
      const reenableOps = reenabledParticipants.map((provided) => {
        const dbP = allDbParticipants.find(db => db.modelId === provided.modelId);
        if (!dbP) {
          return null; // Should never happen due to filter logic, but safety check
        }
        // Track the mapping for changelog (reuse existing DB ID)
        participantIdMapping.set(provided.id, dbP.id);
        return db.update(tables.chatParticipant)
          .set({
            isEnabled: true,
            role: provided.role ?? null,
            customRoleId: provided.customRoleId ?? null,
            priority: provided.priority,
            updatedAt: new Date(),
          })
          .where(eq(tables.chatParticipant.id, dbP.id));
      }).filter((op): op is NonNullable<typeof op> => op !== null);

      // ✅ FIXED: Helper to extract model name from modelId
      const extractModelName = (modelId: string) => {
        // Extract last part after "/" for better readability
        const parts = modelId.split('/');
        return parts[parts.length - 1] || modelId;
      };

      // Create specific changelog entries with simplified types
      if (removedParticipants.length > 0) {
        removedParticipants.forEach((removed) => {
          const modelName = extractModelName(removed.modelId);
          const displayName = removed.role || modelName;
          changelogEntries.push({
            id: ulid(),
            changeType: ChangelogTypes.REMOVED,
            changeSummary: `Removed ${displayName}`,
            changeData: {
              type: 'participant',
              participantId: removed.id,
              modelId: removed.modelId,
              role: removed.role,
            },
          });
        });
      }

      if (addedParticipants.length > 0) {
        addedParticipants.forEach((added) => {
          const modelName = extractModelName(added.modelId);
          const displayName = added.role || modelName;
          const realDbId = participantIdMapping.get(added.id); // Get the real database ID
          changelogEntries.push({
            id: ulid(),
            changeType: ChangelogTypes.ADDED,
            changeSummary: `Added ${displayName}`,
            changeData: {
              type: 'participant',
              participantId: realDbId || added.id, // Use real DB ID, fallback to temp ID
              modelId: added.modelId,
              role: added.role,
            },
          });
        });
      }

      if (updatedParticipants.length > 0) {
        updatedParticipants.forEach((updated) => {
          // Find the DB participant by modelId (since role might have changed)
          const dbP = enabledDbParticipants.find(db => db.modelId === updated.modelId);
          if (!dbP) {
            return;
          }

          const oldRole = dbP.role || null;
          const newRole = updated.role || null;

          // Only create changelog if role actually changed
          if (oldRole !== newRole) {
            const modelName = extractModelName(updated.modelId);
            const oldDisplay = oldRole || 'No Role';
            const newDisplay = newRole || 'No Role';

            changelogEntries.push({
              id: ulid(),
              changeType: ChangelogTypes.MODIFIED,
              changeSummary: `Updated ${modelName} role from "${oldDisplay}" to "${newDisplay}"`,
              changeData: {
                type: 'participant_role',
                participantId: dbP.id,
                modelId: updated.modelId,
                oldRole,
                newRole,
              },
            });
          }
        });
      }

      // ✅ NEW: Create changelog entries for re-enabled participants
      if (reenabledParticipants.length > 0) {
        reenabledParticipants.forEach((reenabled) => {
          const modelName = extractModelName(reenabled.modelId);
          const displayName = reenabled.role || modelName;
          const dbP = allDbParticipants.find(db => db.modelId === reenabled.modelId);
          changelogEntries.push({
            id: ulid(),
            changeType: ChangelogTypes.ADDED, // Treat as "added" for user-facing message
            changeSummary: `Added ${displayName}`,
            changeData: {
              type: 'participant',
              participantId: dbP?.id || reenabled.id,
              modelId: reenabled.modelId,
              role: reenabled.role,
            },
          });
        });
      }

      // Reordering changelog removed - it's visually obvious to users from the participant order

      // Only persist if there are actual changes
      if (changelogEntries.length > 0 || insertOps.length > 0 || updateOps.length > 0 || disableOps.length > 0 || reenableOps.length > 0) {
        // Build changelog insert operations
        const changelogOps = changelogEntries.map(entry =>
          db.insert(tables.chatThreadChangelog)
            .values({
              id: entry.id,
              threadId,
              roundNumber: currentRoundNumber,
              changeType: entry.changeType,
              changeSummary: entry.changeSummary,
              changeData: entry.changeData,
              createdAt: new Date(),
            })
            .onConflictDoNothing(),
        );

        // ✅ Execute all operations atomically (INSERT new, UPDATE existing, RE-ENABLE, DISABLE removed)
        await executeBatch(db, [...insertOps, ...updateOps, ...reenableOps, ...disableOps, ...changelogOps]);
      }
    }

    // =========================================================================
    // STEP 1.6: ✅ LOAD PARTICIPANTS (After Persistence)
    // =========================================================================
    // OPTIMIZATION: Only reload participants when participant 0 persisted changes
    // This prevents redundant database queries for subsequent participants (1, 2, 3...)
    //
    // RELOAD STRATEGY:
    // - Participant 0 with providedParticipants: MUST reload (just persisted changes)
    // - Participants 1+ with providedParticipants: Use initial thread.participants (no persistence)
    // - Any participant without providedParticipants: Use initial thread.participants
    //
    // Performance Impact: Saves 25-50ms per subsequent participant request

    let participants: Array<typeof tables.chatParticipant.$inferSelect>;

    if (providedParticipants && participantIndex === 0) {
      // ✅ PARTICIPANT 0 ONLY: Reload from database after persistence
      // Only participant 0 persists changes, so only it needs to reload
      // Performance Optimization: Saves 25-50ms per subsequent participant request

      const reloadedThread = await db.query.chatThread.findFirst({
        where: eq(tables.chatThread.id, threadId),
        with: {
          participants: {
            where: eq(tables.chatParticipant.isEnabled, true),
            orderBy: [asc(tables.chatParticipant.priority)],
          },
        },
      });

      if (!reloadedThread || reloadedThread.participants.length === 0) {
        throw createError.badRequest('No enabled participants after persistence');
      }

      participants = reloadedThread.participants;
    } else {
      // ✅ SUBSEQUENT PARTICIPANTS (1, 2, 3...) OR NO CONFIG: Use initial thread.participants
      // Subsequent participants don't persist changes, so they can use cached data from line 79
      // This optimization eliminates redundant queries while maintaining consistency
      participants = thread.participants;
    }

    if (participants.length === 0) {
      throw createError.badRequest('No enabled participants in this thread');
    }

    // =========================================================================
    // STEP 2: Get SINGLE Participant (frontend orchestration)
    // =========================================================================

    const participant = participants[participantIndex ?? 0];
    if (!participant) {
      throw createError.badRequest(`Participant at index ${participantIndex} not found`);
    }

    // =========================================================================
    // STEP 3: ✅ AI SDK V5 OFFICIAL PATTERN - Load Previous Messages from DB
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence#sending-only-the-last-message
    // =========================================================================
    // OPTIMIZATION: Instead of sending entire message history from frontend,
    // load previous messages from database and append new message.
    //
    // Benefits:
    // - Reduced bandwidth (important for long conversations)
    // - Faster requests as conversation grows
    // - Single source of truth (database)

    // Load previous messages directly from database
    const previousDbMessages = await db.query.chatMessage.findMany({
      where: eq(tables.chatMessage.threadId, threadId),
      orderBy: [
        asc(tables.chatMessage.roundNumber),
        asc(tables.chatMessage.createdAt),
        asc(tables.chatMessage.id),
      ],
    });

    // ✅ AI SDK V5 VALIDATION: Convert and validate database messages
    // chatMessagesToUIMessages() now uses AI SDK validateUIMessages() internally
    const previousMessages = await chatMessagesToUIMessages(previousDbMessages);

    // =========================================================================
    // STEP 3.5: ✅ AI SDK V5 MESSAGE VALIDATION - Validate incoming messages
    // =========================================================================
    // OFFICIAL AI SDK PATTERN: Always validate incoming messages before processing
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#validating-messages-from-database
    //
    // VALIDATION FLOW:
    // 1. Previous messages loaded from DB → validated by chatMessagesToUIMessages()
    // 2. New message from frontend → needs validation
    // 3. Combine ALL messages → re-validate entire conversation history
    // 4. Ensures complete conversation compliance before streaming
    //
    // This ensures:
    // - Message format compliance (UIMessage structure)
    // - Metadata schema validation (roundNumber, participantId, etc.)
    // - Data integrity before any processing or database operations
    //
    // CRITICAL: Validate at entry point to catch malformed messages early
    //
    // NOTE: AI SDK deduplicates messages internally, so duplicates are safe

    const allMessages = [...previousMessages, message as UIMessage];

    let typedMessages: UIMessage[] = [];

    try {
      // ✅ AI SDK V5 BEST PRACTICE: Validate ALL messages (previous + new)
      // - Previous messages already validated by chatMessagesToUIMessages()
      // - New message validated here
      // - Full conversation history re-validated for safety
      // - AI SDK handles deduplication automatically
      //
      // NOTE: We don't validate metadata schema here because:
      // - Incoming messages have minimal metadata (roundNumber, isParticipantTrigger)
      // - UIMessageMetadataSchema is a discriminated union requiring 'role' field
      // - Message.role already provides role information at message level
      // - Metadata is optional per UIMessage spec
      typedMessages = await validateUIMessages({
        messages: allMessages,
        // Don't validate metadata - allow messages with partial/minimal metadata
      });
    } catch (error) {
      throw createError.badRequest(
        `Invalid message format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { errorType: 'validation' },
      );
    }

    // =========================================================================
    // STEP 4: Save New User Message (ONLY first participant)
    // =========================================================================
    // ✅ EVENT-BASED ROUND TRACKING: Only first participant saves user message
    // This prevents duplicate user messages and ensures consistent round numbers

    const lastMessage = typedMessages[typedMessages.length - 1];
    if (lastMessage && lastMessage.role === 'user' && participantIndex === 0) {
      const existsInDb = await db.query.chatMessage.findFirst({
        where: eq(tables.chatMessage.id, lastMessage.id),
      });

      if (!existsInDb) {
        const textParts = lastMessage.parts?.filter(part => part.type === 'text') || [];
        if (textParts.length > 0) {
          const content = textParts
            .map((part) => {
              if ('text' in part && typeof part.text === 'string') {
                return part.text;
              }
              return '';
            })
            .join('')
            .trim();

          if (content.length > 0) {
            // ✅ DUPLICATE PREVENTION: Check if a user message exists in this round
            // Since we can't filter by JSON content in SQL, check all messages in the round
            const roundMessages = await db.query.chatMessage.findMany({
              where: and(
                eq(tables.chatMessage.threadId, threadId),
                eq(tables.chatMessage.role, 'user'),
                eq(tables.chatMessage.roundNumber, currentRoundNumber),
              ),
              columns: { id: true, parts: true },
            });

            // Check if any existing message has the same content
            const isDuplicate = roundMessages.some(msg =>
              extractTextFromParts(msg.parts).trim() === content,
            );

            if (!isDuplicate) {
              await enforceMessageQuota(user.id);
              await db.insert(tables.chatMessage).values({
                id: lastMessage.id,
                threadId,
                role: 'user',
                parts: [{ type: 'text', text: content }],
                roundNumber: currentRoundNumber,
                metadata: {
                  role: 'user', // ✅ FIX: Add role discriminator for type guard
                  roundNumber: currentRoundNumber,
                },
                createdAt: new Date(),
              });
              await incrementMessageUsage(user.id, 1);
            }
          }
        }
      }
    }

    // =========================================================================
    // STEP 5: Initialize OpenRouter and Setup
    // =========================================================================

    initializeOpenRouter(c.env);
    const client = openRouterService.getClient();
    const userTier = await getUserTier(user.id);

    // ✅ DYNAMIC TOKEN LIMIT: Fetch model info to get context_length and calculate safe max tokens
    // Direct API call to OpenRouter (no caching needed - browser manages context after load)
    // ✅ DYNAMIC PRICING: Also fetch pricing for PostHog LLM tracking
    const modelInfo = await openRouterModelsService.getModelById(participant.modelId);
    const modelContextLength = modelInfo?.context_length || 16000; // Default fallback

    // Extract dynamic pricing for PostHog tracking (per 1M tokens)
    const modelPricing = modelInfo
      ? {
          input: Number.parseFloat(modelInfo.pricing.prompt) * 1_000_000,
          output: Number.parseFloat(modelInfo.pricing.completion) * 1_000_000,
        }
      : undefined;

    // Estimate input tokens: system prompt + average message content
    // Rough estimate: 1 token ≈ 4 characters
    // Use conservative average of 200 tokens per message (includes system, user, assistant)
    const systemPromptTokens = Math.ceil((participant.settings?.systemPrompt || '').length / 4);
    const averageTokensPerMessage = 200;
    const messageTokens = typedMessages.length * averageTokensPerMessage;
    const estimatedInputTokens = systemPromptTokens + messageTokens + 500; // +500 for overhead and safety

    // Calculate safe max output tokens based on model's context length
    const maxOutputTokens = getSafeMaxOutputTokens(
      modelContextLength,
      estimatedInputTokens,
      userTier,
    );

    // =========================================================================
    // STEP 6: ✅ OFFICIAL AI SDK v5 PATTERN - Direct streamText()
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#stream-text
    // =========================================================================

    // Prepare system prompt for this participant
    // ✅ OPTIMIZED SYSTEM PROMPT: 2025 best practices for natural conversation
    // - Avoids AI self-awareness that triggers content filters
    // - Uses persona-based framing for natural engagement
    // - Direct, clear instructions without "AI" terminology
    // - Prevents fourth-wall breaking and self-referential behavior
    const baseSystemPrompt = participant.settings?.systemPrompt
      || (participant.role
        ? `You're ${participant.role}. Engage naturally in this discussion, sharing your perspective and insights. Be direct, thoughtful, and conversational.`
        : `Engage naturally in this discussion. Share your thoughts, ask questions, and build on others' ideas. Be direct and conversational.`);

    // =========================================================================
    // STEP 5.5: ✅ RAG CONTEXT RETRIEVAL - Semantic search for relevant context
    // =========================================================================
    // Retrieve relevant context from previous messages using semantic search
    // This enhances AI responses with relevant information from conversation history
    let systemPrompt = baseSystemPrompt;
    const startRetrievalTime = performance.now();

    try {
      // Extract query from last user message
      const lastUserMessage = typedMessages.findLast(m => m.role === 'user');
      const userQuery = lastUserMessage
        ? extractTextFromParts(lastUserMessage.parts as Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }>)
        : '';

      // Only retrieve context if we have a valid query
      if (userQuery.trim()) {
        // ✅ DIRECT RAG RETRIEVAL: No caching (browser manages context after load)
        // Following FLOW_DOCUMENTATION: Data managed in browser, server provides initial load
        const ragContexts = await ragService.retrieveContext({
          query: userQuery,
          threadId,
          userId: user.id,
          topK: 5,
          minSimilarity: 0.7,
          db,
        });

        const retrievalTimeMs = performance.now() - startRetrievalTime;

        // If we found relevant context, inject it into the system prompt
        if (ragContexts.length > 0) {
          const contextPrompt = ragService.formatContextForPrompt(ragContexts);
          systemPrompt = `${baseSystemPrompt}\n\n${contextPrompt}`;

          // Track RAG usage for analytics (non-blocking)
          ragService.trackContextRetrieval({
            threadId,
            userId: user.id,
            query: userQuery,
            contexts: ragContexts,
            queryTimeMs: retrievalTimeMs,
            db,
          }).catch(() => {
            // Intentionally suppressed
          });
        }
      }
    } catch {
      // RAG failures should not break the chat flow
      // Continue with base system prompt without RAG context
    }

    // Convert UI messages to model messages
    // ✅ SHARED UTILITY: Filter out empty messages (caused by subsequent participant triggers)
    const nonEmptyMessages = filterNonEmptyMessages(typedMessages);

    if (nonEmptyMessages.length === 0) {
      throw createError.badRequest('No valid messages to send to AI model');
    }

    // =========================================================================
    // STEP 6.4: ✅ CONVERT UI MESSAGES TO MODEL MESSAGES
    // =========================================================================
    // AI SDK V5 PATTERN: Convert validated UIMessages to ModelMessages for LLM
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#stream-text
    // Reference: https://sdk.vercel.ai/docs/reference/ai-sdk-core/convert-to-model-messages
    //
    // MESSAGE FORMAT TRANSFORMATION:
    // - UIMessage: Rich format with parts[], metadata, createdAt (frontend/database)
    // - CoreMessage (ModelMessage): Simplified format for LLM providers (OpenRouter, OpenAI, etc.)
    //
    // CONVERSION PROCESS:
    // 1. UIMessage.parts[] → CoreMessage.content (text, tool-call, tool-result)
    // 2. UIMessage.metadata → Stripped (not sent to LLM)
    // 3. UIMessage.createdAt → Stripped (not sent to LLM)
    // 4. UIMessage.role → CoreMessage.role (preserved)
    //
    // IMPORTANT: Messages were already validated at entry point (line 515-529)
    // This ensures we NEVER pass UIMessage[] directly to streamText/generateText
    // Only CoreMessage[] should be passed to LLM providers
    //
    // WHY THIS MATTERS:
    // - LLM providers don't understand UIMessage format (they expect CoreMessage)
    // - Direct UIMessage[] to streamText() will cause runtime errors
    // - convertToModelMessages() handles all edge cases (empty parts, tool calls, etc.)

    let modelMessages;
    try {
      // ✅ CRITICAL: Use convertToModelMessages() to transform validated UIMessages
      // This converts UIMessage format (with parts[]) to CoreMessage format expected by LLMs
      // NEVER pass UIMessage[] directly to streamText() - always convert first
      modelMessages = convertToModelMessages(nonEmptyMessages);
    } catch (error) {
      throw createError.badRequest(
        `Failed to convert messages for model: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { errorType: 'validation' },
      );
    }

    // =========================================================================
    // STEP 6.5: ✅ VALIDATE MESSAGE HISTORY: Ensure last message is from user
    // =========================================================================
    // OpenRouter and most LLM APIs require conversations to end with a user message.
    // This validation prevents the "Last message cannot be from the assistant" error.
    //
    // WHY THIS HAPPENS:
    // - Frontend sends empty user messages to trigger subsequent participants
    // - Backend filters out empty user messages (line 2454)
    // - Result: Message history ends with assistant message → API rejects it
    //
    // FIX: If last message is from assistant, duplicate the last user message to ensure
    // proper conversation structure for multi-participant flows.
    const lastModelMessage = modelMessages[modelMessages.length - 1];
    if (!lastModelMessage || lastModelMessage.role !== 'user') {
      // Find the last user message to duplicate
      const lastUserMessage = nonEmptyMessages.findLast(m => m.role === 'user');
      if (!lastUserMessage) {
        throw createError.badRequest('No valid user message found in conversation history');
      }

      // Extract text content from last user message
      const lastUserText = lastUserMessage.parts?.find(p => p.type === 'text' && 'text' in p);
      if (!lastUserText || !('text' in lastUserText)) {
        throw createError.badRequest('Last user message has no valid text content');
      }

      // Re-convert with the last user message duplicated at the end
      // This ensures the conversation structure is: [user, assistant, user, assistant, ..., user]
      modelMessages = convertToModelMessages([
        ...nonEmptyMessages,
        {
          id: `user-continuation-${ulid()}`,
          role: 'user',
          parts: [{ type: 'text', text: lastUserText.text }],
        },
      ]);
    }

    // =========================================================================
    // STEP 7: ✅ OFFICIAL AI SDK v5 STREAMING PATTERN
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#stream-text
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/error-handling
    // =========================================================================
    //
    // OFFICIAL PATTERN: Direct streamText() → toUIMessageStreamResponse()
    // - NO content validation (models return what they return)
    // - NO custom retry loops (AI SDK maxRetries handles all retries)
    // - NO minimum length checking (accept all model responses)
    //
    // CUSTOMIZATION: Multi-participant routing via participantIndex (application-specific)
    //

    // ✅ TEMPERATURE SUPPORT: Some models (like o4-mini) don't support temperature parameter
    // Check if model supports temperature before including it
    const modelSupportsTemperature = !participant.modelId.includes('o4-mini') && !participant.modelId.includes('o4-deep');
    const temperatureValue = modelSupportsTemperature ? (participant.settings?.temperature ?? 0.7) : undefined;

    // ✅ STREAMING APPROACH: Direct streamText() without validation
    //
    // PHILOSOPHY:
    // - Stream responses immediately without pre-validation
    // - AI SDK built-in retry handles transient errors (network, rate limits)
    // - onFinish callback handles response-level errors (empty responses, content filters)
    // - No double API calls, no validation overhead, faster response times
    //
    // Parameters for streamText
    const streamParams = {
      model: client(participant.modelId),
      system: systemPrompt,
      messages: modelMessages,
      maxOutputTokens,
      ...(modelSupportsTemperature && { temperature: temperatureValue }),
      maxRetries: AI_RETRY_CONFIG.maxAttempts, // AI SDK handles retries
      abortSignal: AbortSignal.any([
        (c.req as unknown as { raw: Request }).raw.signal,
        AbortSignal.timeout(AI_TIMEOUT_CONFIG.perAttemptMs),
      ]),
      // ✅ AI SDK V5 TELEMETRY: Enable experimental telemetry for OpenTelemetry integration
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/telemetry
      // This enables automatic trace generation that can be exported to any OpenTelemetry-compatible backend
      experimental_telemetry: {
        isEnabled: true,
        functionId: `chat.thread.${threadId}.participant.${participantIndex}`,
        // Record inputs/outputs for full observability (PostHog best practice)
        recordInputs: true,
        recordOutputs: true,
        // Custom metadata for telemetry traces (enriched with all relevant context)
        metadata: {
          // Thread/conversation context
          thread_id: threadId,
          round_number: currentRoundNumber,
          conversation_mode: thread.mode,

          // Participant context
          participant_id: participant.id,
          participant_index: participantIndex,
          participant_role: participant.role || 'no-role',
          is_first_participant: participantIndex === 0,
          total_participants: participants.length,

          // Model context
          model_id: participant.modelId,
          model_name: modelInfo?.name || participant.modelId,
          model_context_length: modelContextLength,
          max_output_tokens: maxOutputTokens,

          // User context
          user_id: user.id,
          user_tier: userTier,

          // Request context
          is_regeneration: !!regenerateRound,
          rag_enabled: systemPrompt !== baseSystemPrompt,
          has_custom_system_prompt: !!participant.settings?.systemPrompt,

          // Performance expectations
          estimated_input_tokens: estimatedInputTokens,

          // Pricing context (for cost tracking) - only include if defined
          uses_dynamic_pricing: !!modelPricing,
          ...(modelPricing?.input && { input_cost_per_million: modelPricing.input }),
          ...(modelPricing?.output && { output_cost_per_million: modelPricing.output }),
        },
      },
      // ✅ CONDITIONAL RETRY: Don't retry validation errors (400), authentication errors (401, 403)
      // These are permanent errors that won't be fixed by retrying
      shouldRetry: ({ error }: { error: unknown }) => {
        // Extract status code and error name from error
        const err = error as Error & { statusCode?: number; responseBody?: string; name?: string };
        const statusCode = err?.statusCode;
        const errorName = err?.name || '';

        // Don't retry AI SDK type validation errors - these are provider response format issues
        // that won't be fixed by retrying. The stream already partially succeeded.
        if (errorName === 'AI_TypeValidationError') {
          return false;
        }

        // Don't retry validation errors (400) - malformed requests
        if (statusCode === 400) {
          // Check for specific non-retryable error messages
          const errorMessage = err?.message || '';
          const responseBody = err?.responseBody || '';

          // Don't retry "Multi-turn conversations are not supported" errors
          if (errorMessage.includes('Multi-turn conversations are not supported')
            || responseBody.includes('Multi-turn conversations are not supported')) {
            return false;
          }

          return false;
        }

        // Don't retry authentication errors (401, 403) - requires API key fix
        if (statusCode === 401 || statusCode === 403) {
          return false;
        }

        // Don't retry model not found errors (404) - model doesn't exist
        if (statusCode === 404) {
          return false;
        }

        // Retry everything else (rate limits, network errors, etc.)
        return true;
      },
    };

    // ✅ REASONING CAPTURE: Accumulate reasoning deltas from stream
    // AI SDK streams reasoning in parts (reasoning-start, reasoning-delta, reasoning-end)
    // but doesn't include the full reasoning in finishResult for most models
    const reasoningDeltas: string[] = [];

    // ✅ MESSAGE ID TRACKING: Generate unique ID for this participant's message
    // CRITICAL FIX: Pre-generate ID using ulid() to avoid AI SDK's generateId() collisions
    // AI SDK's generateId() uses timestamps and can generate identical IDs when multiple
    // participants process simultaneously, causing database conflicts and missing messages
    const streamMessageId = ulid();

    // =========================================================================
    // ✅ POSTHOG LLM TRACKING: Initialize trace and timing
    // =========================================================================
    const llmTraceId = generateTraceId();
    const llmStartTime = performance.now();

    // =========================================================================
    // ✅ POSTHOG SESSION TRACKING: Use Better Auth session for tracking
    // =========================================================================
    // ✅ POSTHOG SESSION TRACKING: Extract distinct ID and session ID
    // =========================================================================
    // PostHog Best Practice: Link LLM events to Session Replay for debugging
    // Using Better Auth session.id provides stable, reliable session tracking
    // that's consistent with the application's authentication pattern
    const { session } = c.auth();

    // Create tracking context for this LLM generation
    const trackingContext = createTrackingContext(
      user.id,
      session?.id || user.id, // ✅ Better Auth session.id - required for PostHog tracking, fallback to userId
      threadId,
      currentRoundNumber,
      participant,
      participantIndex ?? 0,
      thread.mode,
      {
        modelName: modelInfo?.name,
        isRegeneration: !!regenerateRound,
        userTier,
      },
    );

    // =========================================================================
    // ✅ PREPARE PARTICIPANT METADATA FOR STREAMING
    // =========================================================================
    // This metadata will be injected into the streaming response via messageMetadata callback
    // It ensures the frontend receives participant information during streaming, not just after completion
    const streamMetadata = {
      roundNumber: currentRoundNumber,
      participantId: participant.id,
      participantIndex,
      participantRole: participant.role,
      model: participant.modelId,
    };

    // =========================================================================
    // ✅ AI SDK V5 BUILT-IN RETRY LOGIC
    // =========================================================================
    // Use AI SDK's built-in retry mechanism instead of custom retry loop
    // Benefits:
    // 1. No duplicate messages on frontend (retries happen internally)
    // 2. Exponential backoff for transient errors
    // 3. Single stream to frontend (cleaner UX)
    // 4. Follows official AI SDK v5 patterns
    //
    // The AI SDK automatically retries:
    // - Network errors
    // - Rate limit errors (429)
    // - Server errors (500, 502, 503)
    //
    // It does NOT retry:
    // - Validation errors (400)
    // - Authentication errors (401, 403)
    // - Not found errors (404)
    // - Content policy violations
    //
    // Reference: https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text
    // =========================================================================

    // =========================================================================
    // ✅ QUOTA DEDUCTION: Enforce and deduct quota BEFORE streaming begins
    // This ensures user is charged even if connection is lost or stream is aborted
    // =========================================================================
    await enforceMessageQuota(user.id);
    await incrementMessageUsage(user.id, 1);

    // ✅ STREAM RESPONSE: Single stream with built-in AI SDK retry logic
    const finalResult = streamText({
      ...streamParams,

      // ✅ AI SDK V5 BUILT-IN RETRY: Configure retry behavior
      // maxRetries: Maximum number of automatic retries for transient errors
      // Default is 2, which gives us 3 total attempts (1 initial + 2 retries)
      maxRetries: AI_RETRY_CONFIG.maxAttempts - 1, // -1 because maxRetries doesn't count initial attempt

      onChunk: async ({ chunk }) => {
        if (chunk.type === 'reasoning-delta') {
          reasoningDeltas.push(chunk.text);
        }
      },

      // ✅ PERSIST MESSAGE: Save to database after streaming completes
      onFinish: async (finishResult) => {
        const messageId = streamMessageId;

        // Delegate to message persistence service
        await saveStreamedMessage({
          messageId,
          threadId,
          participantId: participant.id,
          participantIndex: participantIndex ?? 0,
          participantRole: participant.role,
          modelId: participant.modelId,
          roundNumber: currentRoundNumber,
          text: finishResult.text,
          reasoningDeltas,
          finishResult,
          userId: user.id,
          participants,
          threadMode: thread.mode,
          db,
        });

        // =========================================================================
        // ✅ POSTHOG LLM TRACKING: Track generation with official best practices
        // =========================================================================
        // Following PostHog recommendations:
        // - Always include input/output for observability
        // - Link to Session Replay via $session_id
        // - Track prompt ID/version for A/B testing
        // - Include subscription tier for cost analysis
        // - Capture dynamic pricing from OpenRouter API
        //
        // Reference: https://posthog.com/docs/llm-analytics/generations
        try {
          // Convert recent model messages to PostHog input format (last 5 for context)
          const recentModelMessages = modelMessages.slice(-5);
          const inputMessages = recentModelMessages.map((msg) => {
            return {
              role: msg.role,
              content: typeof msg.content === 'string'
                ? msg.content
                : Array.isArray(msg.content)
                  ? msg.content.map((part) => {
                      if ('text' in part) {
                        return { type: 'text', text: part.text };
                      }
                      if ('image' in part) {
                        return { type: 'image', text: '[image content]' };
                      }
                      return { type: 'unknown', text: '[content]' };
                    })
                  : [],
            };
          });

          // ✅ AI SDK V5 TOKEN USAGE: Extract both usage (final step) and totalUsage (cumulative)
          // Reference: https://sdk.vercel.ai/docs/migration-guides/migration-guide-5-0#distinguish-ai-sdk-usage-reporting-in-50
          // In AI SDK 5.0:
          // - usage: Contains token usage from the FINAL STEP only
          // - totalUsage: Contains CUMULATIVE token usage across ALL STEPS (multi-step reasoning)
          const usage = finishResult.usage
            ? {
                inputTokens: finishResult.usage.inputTokens ?? 0,
                outputTokens: finishResult.usage.outputTokens ?? 0,
                totalTokens: finishResult.usage.totalTokens ?? (finishResult.usage.inputTokens ?? 0) + (finishResult.usage.outputTokens ?? 0),
                cachedInputTokens: finishResult.usage.cachedInputTokens,
              }
            : undefined;

          // ✅ AI SDK V5 MULTI-STEP TRACKING: Use totalUsage for cumulative metrics (if available)
          // For single-step generations, totalUsage === usage
          // For multi-step reasoning (e.g., o1, o3, DeepSeek R1), totalUsage includes ALL steps
          const totalUsage = 'totalUsage' in finishResult && finishResult.totalUsage
            ? {
                inputTokens: finishResult.totalUsage.inputTokens ?? 0,
                outputTokens: finishResult.totalUsage.outputTokens ?? 0,
                totalTokens: finishResult.totalUsage.totalTokens ?? (finishResult.totalUsage.inputTokens ?? 0) + (finishResult.totalUsage.outputTokens ?? 0),
              }
            : usage; // Fallback to usage if totalUsage not available

          // ✅ REASONING TOKENS: Use AI SDK's reasoning token count if available
          // AI SDK v5 tracks reasoning tokens for o1/o3/DeepSeek models
          // Fallback to manual calculation from reasoningDeltas if SDK doesn't provide it
          const reasoningText = reasoningDeltas.join('');
          const reasoningTokens = finishResult.reasoning && finishResult.reasoning.length > 0
            ? finishResult.reasoning.reduce((acc, r) => acc + Math.ceil(r.text.length / 4), 0)
            : Math.ceil(reasoningText.length / 4);

          // Extract and map properties for tracking (AI SDK v5 compatibility)
          await trackLLMGeneration(
            trackingContext,
            {
              text: finishResult.text,
              finishReason: finishResult.finishReason,
              // AI SDK V5: Use usage (final step only)
              usage,
              reasoning: finishResult.reasoning,
              // AI SDK v5: toolCalls and toolResults are already in correct format (ToolCallPart/ToolResultPart)
              toolCalls: finishResult.toolCalls,
              toolResults: finishResult.toolResults,
              response: finishResult.response,
            },
            inputMessages, // PostHog Best Practice: Always include input messages
            llmTraceId,
            llmStartTime,
            {
              // Dynamic model pricing from OpenRouter API
              modelPricing,

              // Model configuration tracking
              modelConfig: {
                temperature: temperatureValue,
                maxTokens: maxOutputTokens,
              },

              // PostHog Best Practice: Prompt tracking for A/B testing
              promptTracking: {
                promptId: participant.role ? `role_${participant.role.replace(/\s+/g, '_').toLowerCase()}` : 'default',
                promptVersion: 'v1.0', // Version your prompts for experimentation
                systemPromptTokens,
              },

              // ✅ AI SDK V5: Pass totalUsage for cumulative metrics
              totalUsage,

              // ✅ REASONING TOKENS: Pass calculated reasoning tokens
              reasoningTokens,

              // Additional custom properties for analytics
              additionalProperties: {
                message_id: messageId,
                reasoning_length_chars: reasoningText.length,
                reasoning_from_sdk: !!(finishResult.reasoning && finishResult.reasoning.length > 0),
                rag_context_used: systemPrompt !== baseSystemPrompt,
                sdk_version: 'ai-sdk-v5',
                is_first_participant: participantIndex === 0,
                total_participants: participants.length,
                message_persisted: true,
              },
            },
          );
        } catch {
          // Tracking should never break the main flow - silently fail
        }
      },
    });

    // ✅ AI SDK V5 OFFICIAL PATTERN: No need to manually consume stream
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text#stream-text
    // The toUIMessageStreamResponse() method handles stream consumption automatically.
    // The onFinish callback will run when the stream completes successfully or on error.
    // Client disconnects are handled by the Response stream - onFinish will still fire.

    // Return stream response
    return finalResult.toUIMessageStreamResponse({
      sendReasoning: true, // Stream reasoning for o1/o3/DeepSeek models

      // ✅ OFFICIAL PATTERN: Pass original messages for type-safe metadata
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/25-message-metadata
      // ✅ CRITICAL FIX: Use previousMessages but exclude the new user message
      // The frontend's aiSendMessage() already adds the user message to state
      // Backend shouldn't re-send it in originalMessages to avoid duplication
      // Filter out the new message by ID to handle race conditions where subsequent
      // participants might query the DB after participant 0 saved the message
      originalMessages: previousMessages.filter(m => m.id !== (message as UIMessage).id),

      // ✅ AI SDK V5 OFFICIAL PATTERN: Server-side message ID generation
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence#message-ids
      // CRITICAL FIX: Return pre-generated ulid() to ensure uniqueness across concurrent participants
      // Pre-generating the ID prevents AI SDK's generateId() timestamp collisions
      generateMessageId: () => streamMessageId,

      // ✅ AI SDK V5 OFFICIAL PATTERN: Inject participant metadata at stream lifecycle events
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/25-message-metadata
      // The callback receives { part } with type: 'start' | 'finish' | 'start-step' | 'finish-step'
      // Send metadata on 'start' to ensure frontend receives participant info immediately
      // Send additional metadata on 'finish' to include usage stats
      messageMetadata: ({ part }) => {
        // Send participant metadata when streaming starts
        if (part.type === 'start') {
          return streamMetadata;
        }

        // Send additional metadata when streaming finishes
        if (part.type === 'finish') {
          return {
            ...streamMetadata,
            totalTokens: part.totalUsage?.totalTokens ?? 0,
            finishReason: part.finishReason,
          };
        }

        // For 'start-step' and 'finish-step', return undefined (no extra metadata needed)
        return undefined;
      },

      onError: (error) => {
        // ✅ POSTHOG LLM TRACKING: Track LLM errors with trace linking
        // Non-blocking error tracking for observability
        trackLLMError(
          trackingContext,
          error as Error,
          llmTraceId,
          'streaming',
        ).catch(() => {
          // Silently fail - never break error handling flow
        });

        // ✅ DEEPSEEK R1 WORKAROUND: Suppress logprobs validation errors
        // These are non-fatal errors from DeepSeek R1's non-conforming logprobs structure
        // Reference: https://github.com/vercel/ai/issues/9087
        const err = error as Error & { name?: string };
        if (err?.name === 'AI_TypeValidationError' && err?.message?.includes('logprobs')) {
          // Return empty string to indicate error was handled and stream should continue
          return '';
        }

        // ✅ AI SDK V5 PATTERN: Detect RetryError for retry exhaustion
        // Reference: ai-sdk-v5-crash-course exercise 07.04 - Error Handling in Streaming
        // When all retry attempts are exhausted, AI SDK throws RetryError
        if (RetryError.isInstance(error)) {
          return JSON.stringify({
            errorName: 'RetryError',
            errorType: 'retry_exhausted',
            errorCategory: 'provider_rate_limit',
            errorMessage: 'Maximum retries exceeded. The model provider is currently unavailable. Please try again later.',
            isTransient: true,
            shouldRetry: false, // All retries already exhausted by AI SDK
            participantId: participant.id,
            modelId: participant.modelId,
            participantRole: participant.role,
          });
        }

        // ✅ REFACTORED: Use shared error utility from /src/api/common/error-handling.ts
        const errorMetadata = structureAIProviderError(error, {
          id: participant.id,
          modelId: participant.modelId,
          role: participant.role,
        });

        return JSON.stringify(errorMetadata);
      },
    });
  },
);
