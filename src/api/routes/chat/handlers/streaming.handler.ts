/**
 * Streaming Handler - Real-time AI response streaming with SSE
 *
 * Following backend-patterns.md: Domain-specific handler module
 * Extracted from monolithic handler.ts for better maintainability
 *
 * This handler orchestrates multi-participant AI conversations with streaming responses.
 * It includes complex round management, participant orchestration, and real-time SSE delivery.
 */

import type { RouteHandler } from '@hono/zod-openapi';
import type { UIMessage } from 'ai';
import { convertToModelMessages, generateId, RetryError, streamText, validateUIMessages } from 'ai';
import { and, asc, desc, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { ulid } from 'ulid';

import { executeBatch } from '@/api/common/batch-operations';
import { createError, structureAIProviderError } from '@/api/common/error-handling';
import { createHandler } from '@/api/core';
import type { ChangelogType } from '@/api/core/enums';
import { ChangelogTypes } from '@/api/core/enums';
import { modelCache } from '@/api/services/cache/model-cache';
import { initializeOpenRouter, openRouterService } from '@/api/services/openrouter.service';
import { openRouterModelsService } from '@/api/services/openrouter-models.service';
import {
  AI_RETRY_CONFIG,
  AI_TIMEOUT_CONFIG,
  getSafeMaxOutputTokens,
} from '@/api/services/product-logic.service';
import { ragService } from '@/api/services/rag.service';
import {
  checkAnalysisQuota,
  enforceMessageQuota,
  getUserTier,
  incrementMessageUsage,
} from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import * as tables from '@/db/schema';
import { UIMessageMetadataSchema } from '@/lib/schemas/message-metadata';
import { extractTextFromParts } from '@/lib/schemas/message-schemas';
import { filterNonEmptyMessages } from '@/lib/utils/message-transforms';

import type { streamChatRoute } from '../route';
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
    // STEP 0: ✅ AI SDK V5 VALIDATION - Validate incoming message exists
    // =========================================================================
    // OFFICIAL PATTERN: Validate single message exists before processing
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot-message-persistence#sending-only-the-last-message
    //
    // NOTE: Full message validation (format, structure, metadata) happens at STEP 3.5
    // This early check ensures we fail fast if no message was provided
    if (!message) {
      throw createError.badRequest('Message is required', { errorType: 'validation' });
    }

    const db = await getDbAsync();

    // =========================================================================
    // STEP 1: Verify Thread & Load/Use Participants
    // =========================================================================

    if (!threadId) {
      throw createError.badRequest('Thread ID is required for streaming');
    }

    // Load thread for verification and metadata
    // Always load participants from DB for verification, but may override with providedParticipants
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
    // STEP 1.3: ✅ REGENERATE ROUND: Delete old messages and analysis if regenerating
    // =========================================================================
    // When regenerateRound is provided, we delete all existing messages and analysis
    // for that round number. This allows the new streaming to reuse the same round number
    // and effectively "replace" the old round with new content.
    //
    // This is only done by the first participant (index 0) to avoid race conditions
    // where multiple participants try to delete the same messages simultaneously.

    if (regenerateRound && participantIndex === 0) {
      // ✅ VALIDATE: Only allow regeneration of most recent round
      const maxRound = await db.query.chatMessage.findFirst({
        where: eq(tables.chatMessage.threadId, threadId),
        orderBy: desc(tables.chatMessage.roundNumber),
        columns: { roundNumber: true },
      });

      const maxRoundNumber = maxRound?.roundNumber || 0;

      if (regenerateRound !== maxRoundNumber) {
        throw createError.badRequest(
          `Can only regenerate the most recent round (${maxRoundNumber}). Attempted to regenerate round ${regenerateRound}.`,
        );
      }

      try {
        // ✅ DELETE ONLY ASSISTANT MESSAGES (preserve user messages)
        const deletedMessages = await db
          .delete(tables.chatMessage)
          .where(
            and(
              eq(tables.chatMessage.threadId, threadId),
              eq(tables.chatMessage.roundNumber, regenerateRound),
              eq(tables.chatMessage.role, 'assistant'), // ✅ ONLY delete assistant messages
            ),
          )
          .returning();

        // ✅ RAG CLEANUP: Delete embeddings for deleted messages
        // CASCADE foreign key will handle D1 cleanup, but we need to clean Vectorize
        if (deletedMessages.length > 0) {
          for (const deletedMessage of deletedMessages) {
            try {
              await ragService.deleteMessageEmbeddings({
                messageId: deletedMessage.id,
                db,
              });
            } catch {
              // Log but don't fail the regeneration

            }
          }
        }

        // ✅ ATOMIC CLEANUP: Delete all related round data in a single batch
        await executeBatch(db, [
          db.delete(tables.chatModeratorAnalysis).where(
            and(
              eq(tables.chatModeratorAnalysis.threadId, threadId),
              eq(tables.chatModeratorAnalysis.roundNumber, regenerateRound),
            ),
          ),
          db.delete(tables.chatRoundFeedback).where(
            and(
              eq(tables.chatRoundFeedback.threadId, threadId),
              eq(tables.chatRoundFeedback.roundNumber, regenerateRound),
            ),
          ),
          db.delete(tables.chatThreadChangelog).where(
            and(
              eq(tables.chatThreadChangelog.threadId, threadId),
              eq(tables.chatThreadChangelog.roundNumber, regenerateRound),
            ),
          ),
        ]);
      } catch (error) {
        // Re-throw AppError instances (like validation errors)
        if (error instanceof Error && error.name === 'AppError') {
          throw error;
        }

        // Don't fail the request for cleanup errors - continue with streaming
        // The old messages will remain but new ones will be added with a higher round number
      }
    }

    // =========================================================================
    // STEP 1.4: Calculate Round Number (ONLY for first participant)
    // =========================================================================
    // ✅ EVENT-BASED ROUND TRACKING: Calculate round number ONCE per round
    // Only participant 0 calculates the round number to avoid race conditions
    // Other participants will use the roundNumber from the saved user message
    //
    // ✅ TRIGGER MESSAGE HANDLING: Empty messages (isParticipantTrigger) reuse existing round
    // When frontend sends empty trigger to start AI responses, don't create new round

    let currentRoundNumber: number;

    if (regenerateRound && participantIndex === 0) {
      // ✅ REGENERATION: Reuse the exact round number being regenerated
      currentRoundNumber = regenerateRound;
    } else if (participantIndex === 0) {
      // ✅ CRITICAL FIX: Check if message is a trigger (empty content or isParticipantTrigger metadata)
      // Cast message to UIMessage-like structure for property access (message is z.unknown() in schema)
      const messageWithProps = message as {
        metadata?: Record<string, unknown>;
        parts?: Array<{ type: string; text?: string }>;
      };

      const metadata = messageWithProps.metadata;
      const isParticipantTrigger = metadata?.isParticipantTrigger === true;

      // ✅ CRITICAL FIX: Trust frontend's round number if provided
      // Frontend calculates correctly using calculateNextRoundNumber()
      const frontendRoundNumber = metadata?.roundNumber;

      if (typeof frontendRoundNumber === 'number' && frontendRoundNumber >= 1) {
        // Frontend provided explicit round number - trust it
        currentRoundNumber = frontendRoundNumber;
      } else {
        // Fallback to backend calculation if frontend didn't provide
        // Extract text content to check if empty
        const textParts = messageWithProps.parts?.filter(
          (p: { type: string }) => p.type === 'text',
        ) as Array<{ type: 'text'; text: string }> | undefined;
        const textContent = (textParts || [])
          .map(p => p.text)
          .join('')
          .trim();

        // Get existing user messages to determine round number
        const existingUserMessages = await db.query.chatMessage.findMany({
          where: and(
            eq(tables.chatMessage.threadId, threadId),
            eq(tables.chatMessage.role, 'user'),
          ),
          columns: { roundNumber: true },
          orderBy: desc(tables.chatMessage.roundNumber),
          limit: 1,
        });

        const lastRoundNumber = existingUserMessages[0]?.roundNumber || 0;

        // ✅ If trigger message (empty OR flagged), reuse last round number
        // ✅ If real message with content, increment to new round
        if ((isParticipantTrigger || textContent.length === 0) && lastRoundNumber > 0) {
          currentRoundNumber = lastRoundNumber; // Reuse existing round
        } else {
          currentRoundNumber = lastRoundNumber + 1; // New round
        }
      }
    } else {
      // ✅ SUBSEQUENT PARTICIPANTS: Get round number from the latest user message
      // CRITICAL FIX: Replaced time-based filtering with explicit round number matching
      //
      // Strategy:
      // 1. Query the last user message to get the expected round number
      // 2. Check if any assistant has responded in that round
      // 3. Use that round number for subsequent participants
      // 4. Throw clear errors if round number cannot be determined
      //
      // This prevents race conditions where time-based filtering (30 seconds) could
      // incorrectly identify the round number or silently fall back to round 1.

      // Step 1: Get the last user message to determine expected round number
      const lastUserMessage = await db.query.chatMessage.findFirst({
        where: and(
          eq(tables.chatMessage.threadId, threadId),
          eq(tables.chatMessage.role, 'user'),
        ),
        columns: { roundNumber: true, createdAt: true },
        orderBy: desc(tables.chatMessage.createdAt),
      });

      if (!lastUserMessage) {
        throw createError.internal(
          `Cannot determine round number for participant ${participantIndex}: No user messages found in thread ${threadId}`,
        );
      }

      const expectedRoundNumber = lastUserMessage.roundNumber;

      // Step 2: Check if any assistant messages exist for this round
      // This handles the race condition where participant 0 might not have saved yet
      const assistantInRound = await db.query.chatMessage.findFirst({
        where: and(
          eq(tables.chatMessage.threadId, threadId),
          eq(tables.chatMessage.role, 'assistant'),
          eq(tables.chatMessage.roundNumber, expectedRoundNumber),
        ),
        columns: { roundNumber: true, createdAt: true },
        orderBy: desc(tables.chatMessage.createdAt),
      });

      // Step 3: Use the round number from either the assistant or the user message
      if (assistantInRound) {
        // ✅ Use roundNumber from parallel participant (same round, already saved)
        currentRoundNumber = assistantInRound.roundNumber;
      } else {
        // ✅ Use round number from the last user message
        // This is safe because participant 0 calculated this round number before starting
        currentRoundNumber = expectedRoundNumber;
      }
    }

    // =========================================================================
    // STEP 1.4A: ✅ HANDLE MODE CHANGE (If Provided)
    // =========================================================================
    // Check if mode was changed and persist immediately (not staged like participants)
    // Only first participant (index 0) should handle mode changes to avoid duplicates

    if (providedMode && providedMode !== thread.mode && participantIndex === 0) {
      // ✅ ATOMIC: Update thread mode and create changelog entry in single batch
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
    // STEP 1.5: ✅ PERSIST PARTICIPANT CHANGES FIRST (Atomic Pattern)
    // =========================================================================
    // CRITICAL: Persist participant changes BEFORE loading participants for streaming
    // This ensures the participants used for streaming are always up-to-date
    //
    // If participants were provided in request AND this is the first participant (index 0),
    // persist the participant changes to database and create changelog entries.
    // This implements the "staged changes" pattern where participant config changes
    // are only persisted when user submits a new message, not when they change the UI.

    if (providedParticipants && participantIndex === 0) {
      // ✅ DETAILED CHANGE DETECTION: Track specific types of changes
      // Type-safe changeData that matches database schema exactly
      type ChangeDataType = {
        type: 'participant' | 'participant_role' | 'mode_change' | 'participant_reorder';
        // For mode_change
        oldMode?: string;
        newMode?: string;
        // For participant changes
        participantId?: string;
        modelId?: string;
        role?: string | null;
        oldRole?: string | null;
        newRole?: string | null;
        // For participant_reorder
        participants?: Array<{
          id: string;
          modelId: string;
          role: string | null;
          priority: number;
        }>;
        [key: string]: unknown;
      };

      const changelogEntries: Array<{
        id: string;
        changeType: ChangelogType;
        changeSummary: string;
        changeData: ChangeDataType;
      }> = [];

      // ✅ CRITICAL: Load ALL participants (including disabled) for accurate change detection
      // This prevents disabled participants from being treated as "new additions"
      const allDbParticipants = thread.participants; // All participants (enabled + disabled)
      const enabledDbParticipants = allDbParticipants.filter(p => p.isEnabled);
      const providedEnabledParticipants = providedParticipants.filter(p => p.isEnabled !== false);

      // ✅ VALIDATION: Check for duplicate modelIds in provided participants
      const modelIds = providedEnabledParticipants.map(p => p.modelId);
      const duplicateModelIds = modelIds.filter((id, index) => modelIds.indexOf(id) !== index);
      if (duplicateModelIds.length > 0) {
        const uniqueDuplicates = [...new Set(duplicateModelIds)];
        throw createError.badRequest(
          `Duplicate AI models detected: ${uniqueDuplicates.join(', ')}. Each AI model can only be added once per conversation.`,
          { errorType: 'validation' },
        );
      }

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

    // Convert database messages to UIMessage format
    const previousMessages = chatMessagesToUIMessages(previousDbMessages);

    // =========================================================================
    // STEP 3.5: ✅ AI SDK V5 MESSAGE VALIDATION - Validate incoming messages
    // =========================================================================
    // OFFICIAL AI SDK PATTERN: Always validate incoming messages before processing
    // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#validating-messages-from-database
    //
    // This ensures:
    // - Message format compliance (UIMessage structure)
    // - Metadata schema validation (roundNumber, participantId, etc.)
    // - Data integrity before any processing or database operations
    //
    // CRITICAL: Validate at entry point to catch malformed messages early

    const allMessages = [...previousMessages, message as UIMessage];

    let typedMessages: UIMessage[] = [];

    try {
      // ✅ AI SDK V5 BEST PRACTICE: Validate ALL messages (previous + new)
      // This ensures the entire conversation history is valid before streaming
      typedMessages = await validateUIMessages({
        messages: allMessages,
        metadataSchema: UIMessageMetadataSchema,
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
    // ✅ PERFORMANCE OPTIMIZATION: 1-hour cache for model metadata
    // Reference: /docs/analysis/backend-performance-issues.md:769-809
    // - Reduces redundant OpenRouter API calls
    // - Saves 20-100ms per cached model lookup
    // - Models rarely change, 1-hour TTL is safe
    let modelInfo = modelCache.get(participant.modelId);
    if (!modelInfo) {
      // Cache miss - fetch from OpenRouter
      modelInfo = await openRouterModelsService.getModelById(participant.modelId);
      if (modelInfo) {
        modelCache.set(participant.modelId, modelInfo);
      }
    }
    const modelContextLength = modelInfo?.context_length || 16000; // Default fallback

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
    //
    // IMPORTANT: Messages were already validated at entry point (line 700-703)
    // This ensures we NEVER pass UIMessage[] directly to streamText/generateText
    // Only ModelMessage[] should be passed to LLM providers

    let modelMessages;
    try {
      // ✅ CRITICAL: Use convertToModelMessages() to transform validated UIMessages
      // This converts UIMessage format (with parts[]) to ModelMessage format expected by LLMs
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
      experimental_telemetry: {
        isEnabled: true,
        functionId: `chat.thread.${threadId}.participant.${participant.id}`,
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

    // ✅ MESSAGE ID TRACKING: Capture the ID generated by generateMessageId to use in onFinish
    // This ensures frontend and backend use the same message ID, preventing duplication
    let streamMessageId: string | undefined;

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
        const { text, usage, finishReason, providerMetadata, response } = finishResult;

        // ✅ CRITICAL FIX: Extract reasoning from accumulated deltas first
        // Priority 1: Use accumulated reasoning deltas from stream chunks
        let reasoningText: string | null = reasoningDeltas.length > 0 ? reasoningDeltas.join('') : null;

        // ✅ FALLBACK 1: Extract reasoning from finishResult directly (for OpenAI o1/o3)
        // The AI SDK v5 provides reasoning in the finishResult for certain models
        const finishResultWithReasoning = finishResult as typeof finishResult & { reasoning?: string };
        if (!reasoningText) {
          reasoningText = (typeof finishResultWithReasoning.reasoning === 'string' ? finishResultWithReasoning.reasoning : null) || null;
        }

        // ✅ FALLBACK 2: If reasoning not in finishResult, try extracting from providerMetadata
        // This handles cases where providers include reasoning in metadata instead
        if (!reasoningText) {
          const extractReasoning = (metadata: unknown): string | null => {
            if (!metadata || typeof metadata !== 'object')
              return null;

            const meta = metadata as Record<string, unknown>;

            // Helper to safely navigate nested paths
            const getNested = (obj: unknown, path: string[]): unknown => {
              let current = obj;
              for (const key of path) {
                if (!current || typeof current !== 'object')
                  return undefined;
                current = (current as Record<string, unknown>)[key];
              }
              return current;
            };

            // Check all possible reasoning field locations
            const fields = [
              getNested(meta, ['openai', 'reasoning']), // OpenAI o1/o3
              meta.reasoning,
              meta.thinking,
              meta.thought,
              meta.thoughts,
              meta.chain_of_thought,
              meta.internal_reasoning,
              meta.scratchpad,
            ];

            for (const field of fields) {
              if (typeof field === 'string' && field.trim())
                return field.trim();
              if (field && typeof field === 'object') {
                const obj = field as Record<string, unknown>;
                if (typeof obj.content === 'string' && obj.content.trim())
                  return obj.content.trim();
                if (typeof obj.text === 'string' && obj.text.trim())
                  return obj.text.trim();
              }
            }
            return null;
          };

          reasoningText = extractReasoning(providerMetadata);
        }

        // ✅ CRITICAL ERROR HANDLING: Wrap DB operations in try-catch
        // This ensures that errors don't break the round - next participant can still respond
        try {
          // ✅ EXTRACT OPENROUTER ERROR DETAILS: Check providerMetadata and response for error information
          let openRouterError: string | undefined;
          let errorCategory: string | undefined;

          // Check providerMetadata for OpenRouter-specific errors
          if (providerMetadata && typeof providerMetadata === 'object') {
            const metadata = providerMetadata as Record<string, unknown>;
            if (metadata.error) {
              openRouterError = typeof metadata.error === 'string'
                ? metadata.error
                : JSON.stringify(metadata.error);
            }
            if (!openRouterError && metadata.errorMessage) {
              openRouterError = String(metadata.errorMessage);
            }
            // Check for moderation/content filter errors
            if (metadata.moderation || metadata.contentFilter) {
              errorCategory = 'content_filter';
              openRouterError = openRouterError || 'Content was filtered by safety systems';
            }
          }

          // Check response object for errors
          if (!openRouterError && response && typeof response === 'object') {
            const resp = response as Record<string, unknown>;
            if (resp.error) {
              openRouterError = typeof resp.error === 'string'
                ? resp.error
                : JSON.stringify(resp.error);
            }
          }

          // ✅ DETECT EMPTY RESPONSES: Check for provider-level empty responses
          // Note: Empty responses should have been filtered out by the retry loop
          // If we get here with an empty response, all retries were exhausted

          // ✅ VALID RESPONSE: Accept ANY response where the model generated tokens
          // According to AI SDK best practices: if the provider returns tokens without
          // throwing an exception, it's a valid response. Only check for truly empty
          // responses (0 tokens from provider).
          // Accept responses with 1+ tokens even if text content is minimal or empty.
          // NOTE: Refusal detection removed - optimized system prompts prevent refusals by design
          const outputTokens = usage?.outputTokens || 0;
          const isEmptyResponse = outputTokens === 0;

          // Generate comprehensive error message
          let errorMessage: string | undefined;
          let providerMessage: string | undefined;

          if (isEmptyResponse || openRouterError) {
            const outputTokens = usage?.outputTokens || 0;
            const inputTokens = usage?.inputTokens || 0;

            // Use OpenRouter error if available
            if (openRouterError) {
              providerMessage = openRouterError;
              errorMessage = `OpenRouter Error for ${participant.modelId}: ${openRouterError}`;

              // Categorize based on error content
              const errorLower = openRouterError.toLowerCase();
              if (errorLower.includes('not found') || errorLower.includes('does not exist')) {
                errorCategory = 'model_not_found';
              } else if (errorLower.includes('filter') || errorLower.includes('safety') || errorLower.includes('moderation')) {
                errorCategory = 'content_filter';
              } else if (errorLower.includes('rate limit') || errorLower.includes('quota')) {
                errorCategory = 'rate_limit';
              } else if (errorLower.includes('timeout') || errorLower.includes('connection')) {
                errorCategory = 'network';
              } else {
                // Intentionally empty
                errorCategory = errorCategory || 'provider_error';
              }
            } else if (outputTokens === 0) {
              // True provider empty response - 0 tokens generated
              // Provide context-aware error messages based on finish reason
              const baseStats = `Input: ${inputTokens} tokens, Output: 0 tokens, Status: ${finishReason}`;

              if (finishReason === 'stop') {
                // Model completed normally but returned no content - likely filtered or refused
                providerMessage = `Model completed but returned no content. ${baseStats}. This may indicate content filtering, safety constraints, or the model chose not to respond.`;
                errorMessage = `${participant.modelId} returned empty response - possible content filtering or safety block`;
                errorCategory = 'content_filter';
              } else if (finishReason === 'length') {
                // Model hit token limit before generating anything
                providerMessage = `Model hit token limit before generating content. ${baseStats}. Try reducing the conversation history or input length.`;
                errorMessage = `${participant.modelId} exceeded token limit without generating content`;
                errorCategory = 'provider_error';
              } else if (finishReason === 'content-filter') {
                // Explicit content filtering
                providerMessage = `Content was filtered by safety systems. ${baseStats}`;
                errorMessage = `${participant.modelId} blocked by content filter`;
                errorCategory = 'content_filter';
              } else if (finishReason === 'error' || finishReason === 'other') {
                // Provider error
                providerMessage = `Provider error prevented response generation. ${baseStats}. This may be a temporary issue with the model provider.`;
                errorMessage = `${participant.modelId} encountered a provider error`;
                errorCategory = 'provider_error';
              } else {
                // Intentionally empty
                // Unknown/unexpected finish reason
                providerMessage = `Model returned empty response. ${baseStats}`;
                errorMessage = `${participant.modelId} returned empty response (reason: ${finishReason})`;
                errorCategory = 'empty_response';
              }
            }
            // Note: We no longer reject responses with tokens but minimal/empty text content.
            // If model generated 1+ tokens, it's considered a valid response even if text is empty.
          }

          // ✅ SAVE MESSAGE: Content and metadata to database
          const contentToSave = text || '';
          const hasError = isEmptyResponse || !!openRouterError;

          // ✅ DETECT PARTIAL RESPONSE: Distinguish between empty error and partial error
          // A partial response occurs when:
          // 1. There was an error during streaming (hasError is true)
          // 2. Some content was generated before the error (text length > 0 or outputTokens > 0)
          // This helps the frontend show appropriate UI (e.g., "Partial response due to error")
          const isPartialResponse = hasError && (text.length > 0 || (usage?.outputTokens || 0) > 0);

          // ✅ DETERMINE IF ERROR IS TRANSIENT
          // Empty responses with finish_reason='stop' are usually NOT transient
          // (content filtering, safety, or model refusal - retrying won't help)
          // Only mark as transient for network/provider errors
          const isTransientError = hasError && (
            errorCategory === 'provider_error'
            || errorCategory === 'network'
            || errorCategory === 'rate_limit'
            || (errorCategory === 'empty_response' && finishReason !== 'stop')
          );

          // ✅ AI SDK v5 PATTERN: Build parts[] array with text and reasoning
          const parts: Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }> = [];

          if (contentToSave) {
            parts.push({ type: 'text', text: contentToSave });
          }

          if (reasoningText) {
            parts.push({ type: 'reasoning', text: reasoningText });
          }

          // Ensure at least one part exists (empty text for error messages)
          if (parts.length === 0) {
            parts.push({ type: 'text', text: '' });
          }

          // ✅ CRITICAL FIX: Use streamMessageId from generateMessageId if available
          // This ensures frontend and backend use the same message ID, preventing duplication
          // Fallback to ulid() only if streamMessageId wasn't set (should never happen)
          const messageId = streamMessageId || ulid();

          // =========================================================================
          // ✅ VALIDATE ROUND NUMBER BEFORE SAVE (Fix #4 - onFinish validation)
          // =========================================================================
          // Final validation before persisting to database
          // Ensures the round number we're about to save is consistent with the conversation state
          // This catches any edge cases where round calculation might have been incorrect

          // Get latest messages to validate round number at save time
          const latestMessages = await db.query.chatMessage.findMany({
            where: eq(tables.chatMessage.threadId, threadId),
            orderBy: desc(tables.chatMessage.roundNumber),
            limit: 5, // Only need recent messages for validation
          });

          const latestRoundNumber = latestMessages.length > 0
            ? Math.max(...latestMessages.map(m => m.roundNumber))
            : 0;

          // Validate round number hasn't become invalid during streaming
          // This can happen if:
          // - Multiple participants are racing to save
          // - Round regeneration happened mid-stream
          // - Frontend sent incorrect round number
          if (process.env.NODE_ENV === 'development') {
            if (currentRoundNumber < latestRoundNumber - 1) {
              console.warn('[streamChat] onFinish: Round number validation failed - too far behind:', {
                threadId,
                participantIndex,
                participantId: participant.id,
                messageId,
                calculatedRoundNumber: currentRoundNumber,
                latestRoundNumber,
                difference: latestRoundNumber - currentRoundNumber,
                action: 'Using calculated round number anyway (race condition or regeneration)',
              });
            } else if (currentRoundNumber > latestRoundNumber + 1) {
              console.warn('[streamChat] onFinish: Round number validation failed - jumped forward:', {
                threadId,
                participantIndex,
                participantId: participant.id,
                messageId,
                calculatedRoundNumber: currentRoundNumber,
                latestRoundNumber,
                difference: currentRoundNumber - latestRoundNumber,
                action: 'Using calculated round number anyway (should investigate)',
              });
            }
          }

          const [savedMessage] = await db.insert(tables.chatMessage)
            .values({
              id: messageId,
              threadId,
              participantId: participant.id,
              role: 'assistant' as const,
              parts,
              roundNumber: currentRoundNumber,
              metadata: {
                roundNumber: currentRoundNumber, // ✅ CRITICAL: Required by UIMessageMetadataSchema
                model: participant.modelId,
                participantId: participant.id,
                participantIndex,
                participantRole: participant.role,
                usage,
                finishReason,
                hasError,
                errorType: errorCategory || (hasError ? 'empty_response' : undefined),
                errorMessage,
                providerMessage,
                openRouterError,
                isTransient: isTransientError,
                isPartialResponse, // ✅ NEW: Indicates partial content generated before error
                // ⚠️ retryAttempts removed - AI SDK handles retries internally, we don't track attempts
              },
              createdAt: new Date(),
            })
            .onConflictDoNothing()
            .returning();

          // ✅ CACHE INVALIDATION: Revalidate thread messages cache tag
          revalidateTag(`thread:${threadId}:messages`);

          // ✅ RAG EMBEDDING STORAGE: Store message embedding for semantic search
          // Only store embeddings for successful messages (non-empty, no errors)
          if (savedMessage && !hasError && contentToSave.trim()) {
            try {
              await ragService.storeMessageEmbedding({
                message: savedMessage,
                threadId,
                userId: user.id,
                db,
              });
            } catch {
              // Embedding storage failures should not break the chat flow

            }
          }

          // ✅ QUOTA: Message quota already deducted before streaming started (line ~2307)
          // No need to increment again here - quota charged regardless of stream completion

          // ✅ TRIGGER ANALYSIS: When last participant finishes AND all participants succeeded
          if (participantIndex === participants.length - 1 && savedMessage) {
            // ✅ CRITICAL FIX: Use the currentRoundNumber from outer scope (lines 1904-1950)
            // DO NOT recalculate it here - that would give wrong results for rounds > 1
            // The currentRoundNumber is already calculated based on user message count

            // ✅ VALIDATE ROUND: Check if all participants in this round succeeded
            // Query all messages for the current round to ensure none have errors
            const roundMessages = await db.query.chatMessage.findMany({
              where: and(
                eq(tables.chatMessage.threadId, threadId),
                eq(tables.chatMessage.roundNumber, currentRoundNumber),
              ),
              orderBy: [
                asc(tables.chatMessage.roundNumber),
                asc(tables.chatMessage.createdAt),
                asc(tables.chatMessage.id),
              ],
            });

            // ✅ CHECK ALL PARTICIPANTS RESPONDED: Analysis only happens if round is complete
            const expectedParticipantCount = participants.length;
            const assistantMessages = roundMessages.filter(msg => msg.role === 'assistant');
            const actualParticipantCount = assistantMessages.length;

            // ✅ VALIDATION: Check for error messages in round
            const messagesWithErrors = assistantMessages.filter(
              msg => (msg.metadata as { hasError?: boolean })?.hasError === true,
            );

            if (actualParticipantCount < expectedParticipantCount || messagesWithErrors.length > 0) {
              // ✅ RECOVERY: Round incomplete or has errors - skip analysis
              if (process.env.NODE_ENV === 'development') {
                if (messagesWithErrors.length > 0) {
                  console.warn(`[streamChat] Round ${currentRoundNumber} has ${messagesWithErrors.length} error messages, skipping analysis`, {
                    errorMessageIds: messagesWithErrors.map(m => m.id),
                  });
                }
                if (actualParticipantCount < expectedParticipantCount) {
                  console.warn(`[streamChat] Round ${currentRoundNumber} incomplete, skipping analysis`, {
                    threadId,
                    roundNumber: currentRoundNumber,
                    expectedCount: expectedParticipantCount,
                    actualCount: actualParticipantCount,
                    missingCount: expectedParticipantCount - actualParticipantCount,
                    participantIds: participants.map(p => p.id),
                    receivedParticipantIds: assistantMessages.map(m => m.participantId).filter(Boolean),
                  });
                }
              }
            } else {
              // ✅ AUTO-CREATE PENDING ANALYSIS: Create pending analysis record for frontend to stream
              // Round complete, creating pending analysis (consider structured logging if needed)

              // Capture values for async closure (used in analysis creation below)
              const capturedThreadId = threadId;
              const capturedRoundNumber = currentRoundNumber;
              const capturedMode = thread.mode;
              const capturedRoundMessages = roundMessages;
              const capturedUserId = user.id;

              // Create pending analysis record in background (non-blocking)
              (async () => {
                try {
                  // ✅ QUOTA CHECK: Skip creating pending analysis if user is out of quota
                  // This prevents wasted work and follows graceful degradation pattern
                  const analysisQuota = await checkAnalysisQuota(capturedUserId);
                  if (!analysisQuota.canCreate) {
                    if (process.env.NODE_ENV === 'development') {
                      console.warn(`[streamChat] Analysis quota exceeded for user ${capturedUserId} - skipping pending analysis creation`, {
                        current: analysisQuota.current,
                        limit: analysisQuota.limit,
                        threadId: capturedThreadId,
                        roundNumber: capturedRoundNumber,
                      });
                    }
                    return; // Skip creating pending analysis
                  }

                  const db = await getDbAsync();

                  // Check if analysis already exists for this round
                  const existingAnalysis = await db
                    .select()
                    .from(tables.chatModeratorAnalysis)
                    .where(
                      and(
                        eq(tables.chatModeratorAnalysis.threadId, capturedThreadId),
                        eq(tables.chatModeratorAnalysis.roundNumber, capturedRoundNumber),
                      ),
                    )
                    .get();

                  if (existingAnalysis) {
                    // Analysis already exists, skipping (consider structured logging if needed)
                    return;
                  }

                  // Get participant message IDs from this round
                  const assistantMessagesForAnalysis = capturedRoundMessages.filter(m => m.role === 'assistant');
                  const participantMessageIds = assistantMessagesForAnalysis.map(m => m.id);

                  // ✅ VALIDATION: Final check before creating analysis record
                  if (participantMessageIds.length === 0) {
                    if (process.env.NODE_ENV === 'development') {
                      console.error(`[streamChat] Cannot create analysis for round ${capturedRoundNumber}: No assistant messages found`, {
                        threadId: capturedThreadId,
                        roundNumber: capturedRoundNumber,
                        totalMessages: capturedRoundMessages.length,
                      });
                    }
                    return;
                  }

                  // ✅ VALIDATION: Ensure participantMessageIds matches expected count
                  if (process.env.NODE_ENV === 'development') {
                    const expectedCountForAnalysis = participants.length;
                    if (participantMessageIds.length !== expectedCountForAnalysis) {
                      console.warn(`[streamChat] Participant count mismatch for analysis creation`, {
                        threadId: capturedThreadId,
                        roundNumber: capturedRoundNumber,
                        expectedCount: expectedCountForAnalysis,
                        actualCount: participantMessageIds.length,
                        messageIds: participantMessageIds,
                      });
                    }
                  }

                  // Get the user's question from this round
                  const userMessage = capturedRoundMessages.find(m => m.role === 'user');
                  const userQuestion = userMessage
                    ? extractTextFromParts(userMessage.parts)
                    : 'No user question found';

                  // Create pending analysis record
                  const analysisId = ulid();
                  await db
                    .insert(tables.chatModeratorAnalysis)
                    .values({
                      id: analysisId,
                      threadId: capturedThreadId,
                      roundNumber: capturedRoundNumber,
                      mode: capturedMode,
                      userQuestion,
                      status: 'pending',
                      participantMessageIds, // Array of message IDs (JSON mode in schema)
                      analysisData: null,
                      completedAt: null,
                      errorMessage: null,
                    })
                    .run();

                  // Pending analysis created successfully
                } catch (error) {
                  // Non-blocking error - log only in development
                  if (process.env.NODE_ENV === 'development') {
                    console.error(`[streamChat] Failed to create analysis for round ${capturedRoundNumber}:`, error);
                  }
                }
              })();
            }
          }
        } catch {
          // ✅ NON-BLOCKING ERROR: Log but don't throw
          // This allows the next participant to continue even if this one failed to save

          // Don't throw - allow round to continue
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
      // Ensures consistent IDs for database-backed persistence across client refreshes
      generateMessageId: () => {
        // Generate ID and store it for use in onFinish
        const id = generateId();
        streamMessageId = id;
        return id;
      },

      // ✅ CRITICAL FIX: Inject participant metadata into stream
      // Reference: AI SDK messageMetadata callback - called on 'start' and 'finish' events
      // This ensures frontend receives participant info during streaming, not just after completion
      messageMetadata: () => streamMetadata,

      onError: (error) => {
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
