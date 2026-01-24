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
import * as tables from '@/db/tables';
import type { ProjectMemoryMetadata } from '@/db/validation/project';
import { deductCreditsForAction } from '@/services/billing/credit.service';
import { generateTraceId, trackLLMGeneration } from '@/services/errors/posthog-llm-tracking.service';
import { buildMemoryExtractionPrompt } from '@/services/prompts';

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
  extracted: number;
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
  const { projectId, threadId, roundNumber, userQuestion, moderatorSummary, userId, ai, db } = params;

  const result: ExtractionResult = {
    extracted: 0,
    skipped: 0,
    duplicates: 0,
  };

  // Skip if moderator summary is too short (likely error or trivial round)
  // Threshold lowered to 50 to capture more meaningful conversations
  if (moderatorSummary.length < 50) {
    console.error('[Memory Extraction] Skipped: summary too short', {
      projectId,
      threadId,
      roundNumber,
      summaryLength: moderatorSummary.length,
      required: 50,
    });
    return result;
  }
  console.error('[Memory Extraction] Starting extraction', {
    projectId,
    threadId,
    roundNumber,
    summaryLength: moderatorSummary.length,
  });

  // 1. Fetch existing memories to avoid duplicates
  const existingMemories = await db.query.projectMemory.findMany({
    where: and(
      eq(tables.projectMemory.projectId, projectId),
      eq(tables.projectMemory.isActive, true),
    ),
    columns: { content: true, summary: true },
    orderBy: [desc(tables.projectMemory.importance), desc(tables.projectMemory.createdAt)],
    limit: MAX_EXISTING_MEMORIES,
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
      messages: [
        { role: 'user', content: prompt },
      ],
      max_tokens: 1024,
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
        userId,
        threadId,
        roundNumber,
        threadMode: 'memory_extraction',
        participantId: 'system',
        participantIndex: 0,
        modelId: '@cf/meta/llama-3.1-8b-instruct',
      },
      {
        text: responseText,
        finishReason: 'stop',
        usage: {
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
        },
      },
      [{ role: 'user', content: prompt }],
      traceId,
      startTime,
      {
        modelPricing: CLOUDFLARE_AI_PRICING['llama-3.1-8b-instruct'],
        additionalProperties: {
          projectId,
          operation_type: 'memory_extraction',
          provider: 'cloudflare',
          is_token_estimate: true,
        },
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
        threadId,
        responsePreview: responseText.slice(0, 200),
      });
      return result;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.error('[Memory Extraction] Parsed result is not an array', {
        projectId,
        threadId,
        parsedType: typeof parsed,
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
      projectId,
      threadId,
      rawCount: parsed.length,
      validCount: extractedMemories.length,
      memories: extractedMemories.map(m => ({ summary: m.summary, importance: m.importance })),
    });
  } catch (error) {
    console.error('[Memory Extraction] AI call failed:', error);
    return result;
  }

  // 4. Filter and deduplicate
  const memoriesToInsert: Array<{
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
  }> = [];

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
    memoriesToInsert.push({
      id: ulid(),
      projectId,
      content: memory.content,
      summary: memory.summary,
      source: ProjectMemorySources.CHAT,
      sourceThreadId: threadId,
      sourceRoundNumber: roundNumber,
      importance: Math.min(10, Math.max(1, memory.importance)),
      isActive: true,
      metadata: {
        category: memory.category,
        extractedAt: now.toISOString(),
        modelUsed: 'llama-3.1-8b-instruct',
      },
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Log filtering results
  console.error('[Memory Extraction] After filtering', {
    projectId,
    threadId,
    toInsert: memoriesToInsert.length,
    skipped: result.skipped,
    duplicates: result.duplicates,
  });

  // 5. Insert valid memories
  if (memoriesToInsert.length > 0) {
    await db.insert(tables.projectMemory).values(memoriesToInsert);
    result.extracted = memoriesToInsert.length;
    console.error('[Memory Extraction] Inserted memories', {
      projectId,
      threadId,
      count: result.extracted,
    });

    // 6. Deduct credits for memory extraction (per round, not per memory)
    try {
      await deductCreditsForAction(userId, 'memoryExtraction', {
        threadId,
        description: `Memory extraction: ${result.extracted} memories from round ${roundNumber}`,
      });
    } catch {
      // Non-critical - don't fail extraction if billing fails
      console.error('[Memory Extraction] Credit deduction failed', { projectId, userId });
    }
  }

  return result;
}
