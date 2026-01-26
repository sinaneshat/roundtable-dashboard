/**
 * Memory Extraction Service
 *
 * Automatically extracts persistent memories from conversations.
 * Memories are stored per-project for cross-chat context.
 *
 * Architecture:
 * - Runs after moderator completes each round
 * - Uses AI to identify important information
 * - Deduplicates against existing memories
 * - Stores in projectMemory table for RAG retrieval
 */

import { CLOUDFLARE_AI_PRICING } from '@roundtable/shared/constants';
import { ProjectMemorySources } from '@roundtable/shared/enums';
import { and, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';

import type { getDbAsync } from '@/db';
import { chunkForD1Insert } from '@/db/batch-operations';
import * as tables from '@/db/tables';
import type { ProjectMemoryMetadata } from '@/db/validation/project';
import { deductCreditsForAction } from '@/services/billing/credit.service';
import { generateTraceId, trackLLMGeneration } from '@/services/errors/posthog-llm-tracking.service';
import { buildMemoryExtractionPrompt, buildSelectiveMemoryPrompt } from '@/services/prompts';

export type MemoryExtractionParams = {
  projectId: string;
  threadId: string;
  roundNumber: number;
  userQuestion: string;
  moderatorSummary: string;
  userId: string;
  ai: Ai;
  db: Awaited<ReturnType<typeof getDbAsync>>;
};

export type ExtractedMemory = {
  content: string;
  summary: string;
  importance: number;
  category: 'preference' | 'fact' | 'decision' | 'context';
};

type ExtractionResult = {
  extracted: ExtractedMemory[];
  memoryIds: string[];
  skipped: number;
  duplicates: number;
};

const MAX_EXISTING_MEMORIES = 20;
const MIN_IMPORTANCE_THRESHOLD = 5;

/**
 * Extract memories from a completed round
 *
 * Uses Cloudflare AI to identify important information worth remembering:
 * - User preferences/instructions
 * - Important facts (names, dates, project details)
 * - Decisions made that affect future conversations
 */
export async function extractMemoriesFromRound(
  params: MemoryExtractionParams,
): Promise<ExtractionResult> {
  const { ai, db, moderatorSummary, projectId, roundNumber, threadId, userId, userQuestion } = params;

  const result: ExtractionResult = {
    duplicates: 0,
    extracted: [],
    memoryIds: [],
    skipped: 0,
  };

  // Skip if moderator summary is too short (likely error or trivial round)
  // Threshold lowered to 50 to capture more meaningful conversations
  if (moderatorSummary.length < 50) {
    console.error('[Memory Extraction] Skipped: summary too short', {
      projectId,
      required: 50,
      roundNumber,
      summaryLength: moderatorSummary.length,
      threadId,
    });
    return result;
  }
  console.error('[Memory Extraction] Starting extraction', {
    projectId,
    roundNumber,
    summaryLength: moderatorSummary.length,
    threadId,
  });

  // 1. Fetch existing memories to avoid duplicates
  const existingMemories = await db.query.projectMemory.findMany({
    columns: { content: true, summary: true },
    limit: MAX_EXISTING_MEMORIES,
    orderBy: [desc(tables.projectMemory.importance), desc(tables.projectMemory.createdAt)],
    where: and(
      eq(tables.projectMemory.projectId, projectId),
      eq(tables.projectMemory.isActive, true),
    ),
  });

  const existingContent = existingMemories.map(m => m.content);
  const existingSummaries = existingMemories.map(m => m.summary || m.content.slice(0, 50));

  // 2. Build extraction prompt
  const prompt = buildMemoryExtractionPrompt(userQuestion, moderatorSummary, existingSummaries);

  // 3. Call Cloudflare AI for extraction using text generation
  let extractedMemories: ExtractedMemory[] = [];
  const traceId = generateTraceId();
  const startTime = performance.now();

  try {
    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct' as Parameters<Ai['run']>[0], {
      max_tokens: 1024,
      messages: [
        { content: prompt, role: 'user' },
      ],
      temperature: 0.3,
    });

    // Extract response text - handle different response formats
    let responseText = '';
    if (response && typeof response === 'object' && 'response' in response) {
      responseText = String(response.response || '');
    } else if (typeof response === 'string') {
      responseText = response;
    }

    // Track Cloudflare AI usage for PostHog cost analytics
    // Cloudflare AI doesn't return token usage, so estimate from text length
    const estimatedInputTokens = Math.ceil(prompt.length / 4);
    const estimatedOutputTokens = Math.ceil(responseText.length / 4);

    trackLLMGeneration(
      {
        modelId: '@cf/meta/llama-3.1-8b-instruct',
        participantId: 'system',
        participantIndex: 0,
        roundNumber,
        threadId,
        threadMode: 'memory_extraction',
        userId,
      },
      {
        finishReason: 'stop',
        text: responseText,
        usage: {
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
        },
      },
      [{ content: prompt, role: 'user' }],
      traceId,
      startTime,
      {
        additionalProperties: {
          is_token_estimate: true,
          operation_type: 'memory_extraction',
          projectId,
          provider: 'cloudflare',
        },
        modelPricing: CLOUDFLARE_AI_PRICING['llama-3.1-8b-instruct'],
      },
    ).catch(() => {}); // Fire and forget, don't block

    if (!responseText) {
      return result;
    }

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[Memory Extraction] No JSON array found in response', {
        projectId,
        responsePreview: responseText.slice(0, 200),
        threadId,
      });
      return result;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.error('[Memory Extraction] Parsed result is not an array', {
        parsedType: typeof parsed,
        projectId,
        threadId,
      });
      return result;
    }

    extractedMemories = parsed.filter((m): m is ExtractedMemory =>
      typeof m.content === 'string'
      && typeof m.summary === 'string'
      && typeof m.importance === 'number'
      && ['preference', 'fact', 'decision', 'context'].includes(m.category),
    );

    console.error('[Memory Extraction] Parsed memories from AI', {
      memories: extractedMemories.map(m => ({ importance: m.importance, summary: m.summary })),
      projectId,
      rawCount: parsed.length,
      threadId,
      validCount: extractedMemories.length,
    });
  } catch (error) {
    console.error('[Memory Extraction] AI call failed:', error);
    return result;
  }

  // 4. Filter and deduplicate
  const memoriesToInsert: {
    id: string;
    projectId: string;
    content: string;
    summary: string;
    source: typeof ProjectMemorySources.CHAT;
    sourceThreadId: string;
    sourceRoundNumber: number;
    importance: number;
    isActive: boolean;
    metadata: ProjectMemoryMetadata;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  }[] = [];

  for (const memory of extractedMemories) {
    // Skip low-importance memories
    if (memory.importance < MIN_IMPORTANCE_THRESHOLD) {
      result.skipped++;
      continue;
    }

    // Check for duplicates (simple text similarity)
    const isDuplicate = existingContent.some(existing =>
      existing.toLowerCase().includes(memory.content.toLowerCase().slice(0, 50))
      || memory.content.toLowerCase().includes(existing.toLowerCase().slice(0, 50)),
    );

    if (isDuplicate) {
      result.duplicates++;
      continue;
    }

    const now = new Date();
    const memoryId = ulid();
    memoriesToInsert.push({
      content: memory.content,
      createdAt: now,
      createdBy: userId,
      id: memoryId,
      importance: Math.min(10, Math.max(1, memory.importance)),
      isActive: true,
      metadata: {
        category: memory.category,
        extractedAt: now.toISOString(),
        modelUsed: 'llama-3.1-8b-instruct',
      },
      projectId,
      source: ProjectMemorySources.CHAT,
      sourceRoundNumber: roundNumber,
      sourceThreadId: threadId,
      summary: memory.summary,
      updatedAt: now,
    });

    result.extracted.push(memory);
    result.memoryIds.push(memoryId);
  }

  // Log filtering results
  console.error('[Memory Extraction] After filtering', {
    duplicates: result.duplicates,
    projectId,
    skipped: result.skipped,
    threadId,
    toInsert: memoriesToInsert.length,
  });

  // 5. Insert valid memories (chunked to avoid D1 100-parameter limit)
  // projectMemory has 13 columns, so max 7 rows per insert
  if (memoriesToInsert.length > 0) {
    for (const chunk of chunkForD1Insert(memoriesToInsert, 13)) {
      await db.insert(tables.projectMemory).values(chunk);
    }
    console.error('[Memory Extraction] Inserted memories', {
      count: result.extracted.length,
      memoryIds: result.memoryIds,
      projectId,
      threadId,
    });

    // 6. Deduct credits for memory extraction (per round, not per memory)
    try {
      await deductCreditsForAction(userId, 'memoryExtraction', {
        description: `Memory extraction: ${result.extracted.length} memories from round ${roundNumber}`,
        threadId,
      });
    } catch {
      // Non-critical - don't fail extraction if billing fails
      console.error('[Memory Extraction] Credit deduction failed', { projectId, userId });
    }
  }

  return result;
}

// ============================================================================
// Conversation Memory Extraction (Non-Moderator Threads)
// ============================================================================

export type ConversationMemoryParams = {
  projectId: string;
  threadId: string;
  roundNumber: number;
  userQuestion: string;
  participantResponses: { participantName: string; response: string }[];
  userId: string;
  ai: Ai;
  db: Awaited<ReturnType<typeof getDbAsync>>;
};

export type ConversationExtractionResult = {
  extracted: ExtractedMemory[];
  memoryIds: string[];
};

const MIN_SELECTIVE_IMPORTANCE = 6; // Higher threshold for non-moderator extraction

/**
 * Extract memories from a conversation (for non-moderator threads)
 *
 * More selective than moderator-based extraction:
 * - Only extracts preferences, important facts, and explicit remember requests
 * - Higher importance threshold (6 vs 5)
 * - Designed for threads without moderator synthesis
 */
export async function extractMemoriesFromConversation(
  params: ConversationMemoryParams,
): Promise<ConversationExtractionResult> {
  const { ai, db, participantResponses, projectId, roundNumber, threadId, userId, userQuestion } = params;

  const result: ConversationExtractionResult = {
    extracted: [],
    memoryIds: [],
  };

  // Skip if no meaningful content
  const totalResponseLength = participantResponses.reduce((acc, r) => acc + r.response.length, 0);
  if (totalResponseLength < 100) {
    console.error('[Conversation Memory] Skipped: responses too short', {
      projectId,
      roundNumber,
      threadId,
      totalLength: totalResponseLength,
    });
    return result;
  }

  console.error('[Conversation Memory] Starting extraction', {
    participantCount: participantResponses.length,
    projectId,
    roundNumber,
    threadId,
    totalResponseLength,
  });

  // Fetch existing memories to avoid duplicates
  const existingMemories = await db.query.projectMemory.findMany({
    columns: { content: true, summary: true },
    limit: MAX_EXISTING_MEMORIES,
    orderBy: [desc(tables.projectMemory.importance), desc(tables.projectMemory.createdAt)],
    where: and(
      eq(tables.projectMemory.projectId, projectId),
      eq(tables.projectMemory.isActive, true),
    ),
  });

  const existingContent = existingMemories.map(m => m.content);
  const existingSummaries = existingMemories.map(m => m.summary || m.content.slice(0, 50));

  // Build selective extraction prompt
  const prompt = buildSelectiveMemoryPrompt(
    userQuestion,
    participantResponses.map(r => ({ name: r.participantName, response: r.response })),
    existingSummaries,
  );

  // Call Cloudflare AI for extraction
  let extractedMemories: ExtractedMemory[] = [];
  const traceId = generateTraceId();
  const startTime = performance.now();

  try {
    const response = await ai.run('@cf/meta/llama-3.1-8b-instruct' as Parameters<Ai['run']>[0], {
      max_tokens: 1024,
      messages: [{ content: prompt, role: 'user' }],
      temperature: 0.3,
    });

    let responseText = '';
    if (response && typeof response === 'object' && 'response' in response) {
      responseText = String(response.response || '');
    } else if (typeof response === 'string') {
      responseText = response;
    }

    // Track Cloudflare AI usage
    const estimatedInputTokens = Math.ceil(prompt.length / 4);
    const estimatedOutputTokens = Math.ceil(responseText.length / 4);

    trackLLMGeneration(
      {
        modelId: '@cf/meta/llama-3.1-8b-instruct',
        participantId: 'system',
        participantIndex: 0,
        roundNumber,
        threadId,
        threadMode: 'conversation_memory_extraction',
        userId,
      },
      {
        finishReason: 'stop',
        text: responseText,
        usage: {
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
        },
      },
      [{ content: prompt, role: 'user' }],
      traceId,
      startTime,
      {
        additionalProperties: {
          is_token_estimate: true,
          operation_type: 'conversation_memory_extraction',
          projectId,
          provider: 'cloudflare',
        },
        modelPricing: CLOUDFLARE_AI_PRICING['llama-3.1-8b-instruct'],
      },
    ).catch(() => {});

    if (!responseText) {
      return result;
    }

    // Parse JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[Conversation Memory] No JSON array found', {
        projectId,
        responsePreview: responseText.slice(0, 200),
        threadId,
      });
      return result;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      return result;
    }

    extractedMemories = parsed.filter((m): m is ExtractedMemory =>
      typeof m.content === 'string'
      && typeof m.summary === 'string'
      && typeof m.importance === 'number'
      && ['preference', 'fact', 'decision', 'context'].includes(m.category),
    );

    console.error('[Conversation Memory] Parsed memories', {
      projectId,
      rawCount: parsed.length,
      threadId,
      validCount: extractedMemories.length,
    });
  } catch (error) {
    console.error('[Conversation Memory] AI call failed:', error);
    return result;
  }

  // Filter, deduplicate, and insert
  const memoriesToInsert: {
    id: string;
    projectId: string;
    content: string;
    summary: string;
    source: typeof ProjectMemorySources.CHAT;
    sourceThreadId: string;
    sourceRoundNumber: number;
    importance: number;
    isActive: boolean;
    metadata: ProjectMemoryMetadata;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
  }[] = [];

  for (const memory of extractedMemories) {
    // Skip low-importance memories (higher threshold for selective extraction)
    if (memory.importance < MIN_SELECTIVE_IMPORTANCE) {
      continue;
    }

    // Check for duplicates
    const isDuplicate = existingContent.some(existing =>
      existing.toLowerCase().includes(memory.content.toLowerCase().slice(0, 50))
      || memory.content.toLowerCase().includes(existing.toLowerCase().slice(0, 50)),
    );

    if (isDuplicate) {
      continue;
    }

    const now = new Date();
    const memoryId = ulid();
    memoriesToInsert.push({
      content: memory.content,
      createdAt: now,
      createdBy: userId,
      id: memoryId,
      importance: Math.min(10, Math.max(1, memory.importance)),
      isActive: true,
      metadata: {
        category: memory.category,
        extractedAt: now.toISOString(),
        modelUsed: 'llama-3.1-8b-instruct',
      },
      projectId,
      source: ProjectMemorySources.CHAT,
      sourceRoundNumber: roundNumber,
      sourceThreadId: threadId,
      summary: memory.summary,
      updatedAt: now,
    });

    result.extracted.push(memory);
    result.memoryIds.push(memoryId);
  }

  // Insert memories (chunked to avoid D1 100-parameter limit)
  // projectMemory has 13 columns, so max 7 rows per insert
  if (memoriesToInsert.length > 0) {
    for (const chunk of chunkForD1Insert(memoriesToInsert, 13)) {
      await db.insert(tables.projectMemory).values(chunk);
    }
    console.error('[Conversation Memory] Inserted memories', {
      count: memoriesToInsert.length,
      memoryIds: result.memoryIds,
      projectId,
      threadId,
    });

    // Deduct credits
    try {
      await deductCreditsForAction(userId, 'memoryExtraction', {
        description: `Conversation memory: ${memoriesToInsert.length} memories from round ${roundNumber}`,
        threadId,
      });
    } catch {
      console.error('[Conversation Memory] Credit deduction failed', { projectId, userId });
    }
  }

  return result;
}
