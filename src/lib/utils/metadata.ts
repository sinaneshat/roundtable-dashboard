/**
 * Metadata Utilities
 *
 * **TYPE-SAFE METADATA EXTRACTION**: Single source of truth for all metadata operations
 * **ELIMINATES ANTI-PATTERNS**: No more `as Record<string, unknown>` casts
 *
 * This module consolidates:
 * - metadata-extraction.ts patterns
 * - Inline metadata casts from handlers
 * - Type guards for metadata validation
 *
 * Design Principles:
 * 1. Use Zod validation for runtime type safety
 * 2. Return properly typed values, never `unknown`
 * 3. Provide both nullable and throwing variants
 * 4. Support both frontend (UIMessage) and backend (ChatMessage) types
 */

import type { UIMessage } from 'ai';
import type { Metadata } from 'next';
import { z } from 'zod';

import { BRAND } from '@/constants/brand';
import type {
  DbAssistantMessageMetadata,
  DbMessageMetadata,
  DbModeratorMessageMetadata,
  DbPreSearchMessageMetadata,
  DbUserMessageMetadata,
} from '@/db/schemas/chat-metadata';
import {
  DbAssistantMessageMetadataSchema,
  DbMessageMetadataSchema,
  DbModeratorMessageMetadataSchema,
  DbPreSearchMessageMetadataSchema,
  DbUserMessageMetadataSchema,
  isModeratorMessageMetadata,
  isParticipantMessageMetadata,
} from '@/db/schemas/chat-metadata';
import type { ChatMessage } from '@/db/validation';
import { getBaseUrl } from '@/utils/helpers';

import { isObject } from './type-guards';

// ============================================================================
// Type Guards with Zod Validation
// ============================================================================

/**
 * Safely extract and parse message metadata
 *
 * Validates metadata against MessageMetadataSchema and returns typed metadata.
 * Provides robust error handling for malformed metadata.
 *
 * @param metadata - Raw metadata object from message
 * @returns Parsed MessageMetadata or undefined if no metadata
 *
 * @example
 * ```typescript
 * const metadata = getMessageMetadata(message.metadata);
 * if (metadata?.participantId) {
 *   const participantId = metadata.participantId;
 * }
 * ```
 */
export function getMessageMetadata(metadata: unknown): DbMessageMetadata | undefined {
  if (!metadata)
    return undefined;

  const result = DbMessageMetadataSchema.safeParse(metadata);
  return result.success ? result.data : undefined;
}

/**
 * Type-safe user metadata extraction
 * Returns validated UserMessageMetadata or null
 */
export function getUserMetadata(
  metadata: unknown,
): DbUserMessageMetadata | null {
  const result = DbUserMessageMetadataSchema.safeParse(metadata);
  return result.success ? result.data : null;
}

/**
 * Type-safe assistant metadata extraction
 * Returns validated AssistantMessageMetadata or null
 */
export function getAssistantMetadata(
  metadata: unknown,
): DbAssistantMessageMetadata | null {
  const result = DbAssistantMessageMetadataSchema.safeParse(metadata);
  return result.success ? result.data : null;
}

/**
 * Type-safe participant metadata extraction
 * Returns validated ParticipantMessageMetadata or null
 */
export function getParticipantMetadata(
  metadata: unknown,
): DbAssistantMessageMetadata | null {
  // Participant metadata is assistant metadata with participantId
  const result = DbAssistantMessageMetadataSchema.safeParse(metadata);
  if (!result.success) {
    return null;
  }
  // Verify it has participantId using type guard from db schemas
  const hasParticipantId = isParticipantMessageMetadata(result.data);
  return hasParticipantId ? result.data : null;
}

/**
 * Type-safe pre-search metadata extraction
 * Returns validated PreSearchMessageMetadata or null
 */
export function getPreSearchMetadata(
  metadata: unknown,
): DbPreSearchMessageMetadata | null {
  const result = DbPreSearchMessageMetadataSchema.safeParse(metadata);
  return result.success ? result.data : null;
}

/**
 * Type-safe moderator metadata extraction
 * Returns validated ModeratorMessageMetadata or null
 * ✅ TEXT STREAMING: Used to identify moderator messages in the messages array
 */
export function getModeratorMetadata(
  metadata: unknown,
): DbModeratorMessageMetadata | null {
  const result = DbModeratorMessageMetadataSchema.safeParse(metadata);
  return result.success ? result.data : null;
}

/**
 * Check if a message is from the moderator
 * ✅ TEXT STREAMING: Moderator messages are now in the messages array
 * @param message - UIMessage or ChatMessage to check
 * @returns true if the message is from the moderator
 */
export function isModeratorMessage(
  message: UIMessage | ChatMessage,
): boolean {
  if (!message.metadata) {
    return false;
  }
  const meta = getMessageMetadata(message.metadata);
  return meta !== undefined && isModeratorMessageMetadata(meta);
}

// ============================================================================
// Message-Level Helpers
// ============================================================================

/**
 * Extract metadata from UIMessage with type validation
 * Handles both frontend and backend message types
 * ✅ TEXT STREAMING: Now includes moderator message metadata
 */
export function extractMessageMetadata(
  message: UIMessage | ChatMessage,
): DbUserMessageMetadata | DbAssistantMessageMetadata | DbPreSearchMessageMetadata | DbModeratorMessageMetadata | null {
  if (!message.metadata) {
    return null;
  }

  // Try each schema in order of likelihood
  const userResult = getUserMetadata(message.metadata);
  if (userResult)
    return userResult;

  // ✅ TEXT STREAMING: Check moderator before regular assistant
  // (moderator is a specialized assistant type)
  const moderatorResult = getModeratorMetadata(message.metadata);
  if (moderatorResult)
    return moderatorResult;

  const assistantResult = getAssistantMetadata(message.metadata);
  if (assistantResult)
    return assistantResult;

  const preSearchResult = getPreSearchMetadata(message.metadata);
  if (preSearchResult)
    return preSearchResult;

  return null;
}

// ============================================================================
// Specific Field Extractors (Null-Safe)
// ============================================================================

/**
 * Extract createdAt from a message or its metadata
 * Returns ISO string or null if not available
 *
 * **REPLACES**: `(m as { createdAt?: Date | string }).createdAt`
 *
 * ✅ TYPE-SAFE: No force casting, handles both UIMessage and extended types
 * Handles Date objects, ISO strings, and metadata.createdAt field
 *
 * @param message - Message object (UIMessage, ChatMessage, or extended type)
 * @returns ISO date string or null
 */
export function getCreatedAt(message: unknown): string | null {
  // ✅ TYPE-SAFE: Use type guard instead of force cast
  if (!isObject(message)) {
    return null;
  }

  // 1. Check direct createdAt property (ChatMessage or extended UIMessage)
  if ('createdAt' in message && message.createdAt !== undefined) {
    if (message.createdAt instanceof Date) {
      return message.createdAt.toISOString();
    }
    if (typeof message.createdAt === 'string') {
      return message.createdAt;
    }
  }

  // 2. Check metadata.createdAt (our custom metadata field)
  if ('metadata' in message && isObject(message.metadata)) {
    if ('createdAt' in message.metadata && message.metadata.createdAt !== undefined) {
      if (typeof message.metadata.createdAt === 'string') {
        return message.metadata.createdAt;
      }
    }
  }

  return null;
}

/**
 * Extract roundNumber from metadata (all message types have this)
 * Returns null if metadata is invalid or roundNumber is missing
 *
 * **REPLACES**: `(metadata as Record<string, unknown>)?.roundNumber`
 *
 * ✅ ZOD-FIRST PATTERN: Validates using Zod schemas without type casting
 * Handles 0-based indexing where roundNumber: 0 is valid
 */
export function getRoundNumber(metadata: unknown): number | null {
  if (!metadata) {
    return null;
  }

  // Try each message type schema (user, assistant, pre-search)
  const userResult = DbUserMessageMetadataSchema.safeParse(metadata);
  if (userResult.success) {
    return userResult.data.roundNumber;
  }

  const assistantResult = DbAssistantMessageMetadataSchema.safeParse(metadata);
  if (assistantResult.success) {
    return assistantResult.data.roundNumber;
  }

  const preSearchResult = DbPreSearchMessageMetadataSchema.safeParse(metadata);
  if (preSearchResult.success) {
    return preSearchResult.data.roundNumber;
  }

  // ✅ FALLBACK: Minimal schema for roundNumber extraction only
  // Handles cases where metadata has roundNumber but fails full validation
  const PartialRoundNumberSchema = z.object({
    roundNumber: z.number().int().nonnegative(),
  });

  const partialResult = PartialRoundNumberSchema.partial().safeParse(metadata);
  if (partialResult.success && partialResult.data.roundNumber !== undefined) {
    return partialResult.data.roundNumber;
  }

  return null;
}

/**
 * Extract participantId from metadata (only participant messages)
 * Returns null if not a participant message
 *
 * **REPLACES**: `(metadata as Record<string, unknown>)?.participantId`
 *
 * **FALLBACK**: If full schema validation fails but participantId exists,
 * returns the value anyway. This handles race conditions where metadata
 * is partially populated during streaming.
 */
export function getParticipantId(metadata: unknown): string | null {
  // Try full validation first
  const validated = getParticipantMetadata(metadata);
  if (validated?.participantId) {
    return validated.participantId;
  }

  // Fallback: Extract participantId even when full schema validation fails
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const PartialParticipantIdSchema = z.object({
    participantId: z.string().min(1),
  });

  const partialResult = PartialParticipantIdSchema.partial().safeParse(metadata);
  if (partialResult.success && partialResult.data.participantId) {
    return partialResult.data.participantId;
  }

  return null;
}

/**
 * Extract participantIndex from metadata (only participant messages)
 * Returns null if not a participant message
 *
 * **REPLACES**: `(metadata as Record<string, unknown>)?.participantIndex`
 *
 * **FALLBACK**: If full schema validation fails but participantIndex exists,
 * returns the value anyway. This handles race conditions where metadata
 * is partially populated during streaming.
 */
export function getParticipantIndex(metadata: unknown): number | null {
  // Try full validation first
  const validated = getParticipantMetadata(metadata);
  if (validated?.participantIndex !== undefined) {
    return validated.participantIndex;
  }

  // Fallback: Extract participantIndex even when full schema validation fails
  // This handles race conditions where metadata is partially populated
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const PartialParticipantIndexSchema = z.object({
    participantIndex: z.number().int().nonnegative(),
  });

  const partialResult = PartialParticipantIndexSchema.partial().safeParse(metadata);
  if (partialResult.success && partialResult.data.participantIndex !== undefined) {
    return partialResult.data.participantIndex;
  }

  return null;
}

/**
 * Extract participantRole from metadata (only participant messages)
 * Returns null if not a participant message or role not set
 *
 * **REPLACES**: `(metadata as Record<string, unknown>)?.participantRole`
 */
export function getParticipantRole(metadata: unknown): string | null {
  const validated = getParticipantMetadata(metadata);
  return validated?.participantRole ?? null;
}

/**
 * Extract model from metadata (only assistant messages)
 * Returns null if not an assistant message
 *
 * **REPLACES**: `(metadata as Record<string, unknown>)?.model`
 */
export function getModel(metadata: unknown): string | null {
  const validated = getAssistantMetadata(metadata);
  return validated?.model ?? null;
}

/**
 * Check if message has error (only assistant messages)
 * Returns false for non-assistant messages
 *
 * **REPLACES**: `(metadata as Record<string, unknown>)?.hasError`
 */
export function hasError(metadata: unknown): boolean {
  const validated = getAssistantMetadata(metadata);
  return validated?.hasError ?? false;
}

/**
 * Check if message is pre-search
 * Returns true only if metadata validates as PreSearchMessageMetadata
 *
 * **REPLACES**: `(metadata as Record<string, unknown>)?.isPreSearch === true`
 */
export function isPreSearch(metadata: unknown): boolean {
  const validated = getPreSearchMetadata(metadata);
  return validated !== null;
}

// ============================================================================
// Throwing Variants (For Backend Use)
// ============================================================================

/**
 * Extract participant metadata, throw if invalid
 * Use in backend handlers where invalid metadata is a critical error
 */
export function requireParticipantMetadata(
  metadata: unknown,
): DbAssistantMessageMetadata {
  const result = DbAssistantMessageMetadataSchema.safeParse(metadata);
  if (!result.success) {
    throw new Error(`Invalid participant metadata: ${result.error.message}`);
  }
  if (!isParticipantMessageMetadata(result.data)) {
    throw new Error('Invalid participant metadata: missing participantId');
  }
  return result.data;
}

/**
 * Extract assistant metadata, throw if invalid
 * Use in backend handlers where invalid metadata is a critical error
 */
export function requireAssistantMetadata(
  metadata: unknown,
): DbAssistantMessageMetadata {
  const result = DbAssistantMessageMetadataSchema.safeParse(metadata);
  if (!result.success) {
    throw new Error(`Invalid assistant metadata: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Extract user metadata, throw if invalid
 * Use in backend handlers where invalid metadata is a critical error
 */
export function requireUserMetadata(
  metadata: unknown,
): DbUserMessageMetadata {
  const result = DbUserMessageMetadataSchema.safeParse(metadata);
  if (!result.success) {
    throw new Error(`Invalid user metadata: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Extract pre-search metadata, throw if invalid
 * Use in backend handlers where invalid metadata is a critical error
 */
export function requirePreSearchMetadata(
  metadata: unknown,
): DbPreSearchMessageMetadata {
  const result = DbPreSearchMessageMetadataSchema.safeParse(metadata);
  if (!result.success) {
    throw new Error(`Invalid pre-search metadata: ${result.error.message}`);
  }
  return result.data;
}

// ============================================================================
// Metadata Builders
// ============================================================================

/**
 * Build assistant message metadata with type safety
 *
 * **PURPOSE**: Single source of truth for assistant metadata construction
 * **REPLACES**: Inline metadata building in message-transforms.ts and handlers
 *
 * @param baseMetadata - Base metadata fields (finishReason, usage, etc.)
 * @param baseMetadata.finishReason - Finish reason from streaming response
 * @param baseMetadata.usage - Token usage statistics
 * @param options - Additional fields to include
 * @param options.participantId - Unique participant identifier
 * @param options.participantIndex - Index of participant in list
 * @param options.participantRole - Role assigned to participant
 * @param options.model - Model identifier used for generation
 * @param options.roundNumber - Round number in conversation
 * @param options.hasError - Whether message has error
 * @param options.errorType - Type of error if present
 * @param options.errorMessage - Error message if present
 * @param options.additionalFields - Additional metadata fields to include
 * @returns Fully constructed AssistantMessageMetadata
 *
 * @example
 * ```typescript
 * const metadata = buildAssistantMetadata(
 *   { finishReason: 'stop', usage: { inputTokens: 100, outputTokens: 50 } },
 *   {
 *     participantId: 'part-123',
 *     participantIndex: 0,
 *     model: 'gpt-4',
 *     roundNumber: 1,
 *   }
 * );
 * ```
 */
/**
 * Builder schema for assistant metadata construction
 *
 * ✅ TYPE-SAFE: Type assertion validates against DbAssistantMessageMetadata
 */
export function buildAssistantMetadata(
  baseMetadata: Partial<DbAssistantMessageMetadata>,
  options: {
    participantId?: string;
    participantIndex?: number;
    participantRole?: string | null;
    model?: string;
    roundNumber?: number;
    hasError?: boolean;
    errorType?: string;
    errorMessage?: string;
    additionalFields?: Record<string, unknown>;
  },
): DbAssistantMessageMetadata {
  // Build the metadata object with role as discriminator
  const metadata = {
    role: 'assistant' as const,
    // Base metadata fields
    ...(baseMetadata.finishReason && { finishReason: baseMetadata.finishReason }),
    ...(baseMetadata.usage && { usage: baseMetadata.usage }),
    ...(baseMetadata.isTransient !== undefined && { isTransient: baseMetadata.isTransient }),
    ...(baseMetadata.isPartialResponse !== undefined && { isPartialResponse: baseMetadata.isPartialResponse }),
    ...(baseMetadata.createdAt && { createdAt: baseMetadata.createdAt }),
    // Options fields
    ...(options.roundNumber !== undefined && { roundNumber: options.roundNumber }),
    ...(options.participantId && { participantId: options.participantId }),
    ...(options.participantIndex !== undefined && { participantIndex: options.participantIndex }),
    // ✅ FIX: participantRole can be null, must check undefined not truthiness
    ...(options.participantRole !== undefined && { participantRole: options.participantRole }),
    ...(options.model && { model: options.model }),
    // Error fields
    ...(options.hasError !== undefined && { hasError: options.hasError }),
    ...(options.errorType && { errorType: options.errorType }),
    ...(options.errorMessage && { errorMessage: options.errorMessage }),
    // Additional fields (spread at end to allow overrides)
    ...options.additionalFields,
  } as DbAssistantMessageMetadata;

  return metadata;
}

/**
 * Check if message has participant enrichment data
 *
 * Participant enrichment includes:
 * - participantId
 * - participantIndex
 * - participantRole (optional)
 * - model
 *
 * @param metadata - Message metadata to check
 * @returns True if metadata has participant enrichment
 *
 * @example
 * ```typescript
 * const hasEnrichment = hasParticipantEnrichment(message.metadata);
 * if (!hasEnrichment) {
 *   // Enrich message with participant data
 *   message.metadata = enrichMessageWithParticipant(message, participant);
 * }
 * ```
 */
export function hasParticipantEnrichment(metadata: unknown): boolean {
  const validated = getParticipantMetadata(metadata);
  return validated !== null
    && validated.participantId !== undefined
    && validated.participantIndex !== undefined
    && validated.model !== undefined;
}

/**
 * Enrich message metadata with participant information
 *
 * **PURPOSE**: Add participant context to existing message metadata
 * **USE CASE**: Frontend enrichment when displaying messages
 *
 * @param baseMetadata - Existing message metadata
 * @param participant - Participant data to enrich with
 * @param participant.id - Participant identifier
 * @param participant.modelId - Model identifier for participant
 * @param participant.role - Role assigned to participant
 * @param participant.index - Index of participant in list
 * @returns Enriched metadata with participant fields
 *
 * @example
 * ```typescript
 * const enriched = enrichMessageWithParticipant(
 *   message.metadata,
 *   {
 *     id: 'part-123',
 *     modelId: 'gpt-4',
 *     role: 'assistant',
 *     index: 0,
 *   }
 * );
 * ```
 */
/**
 * Schema for participant enrichment fields
 * Used to validate the enriched metadata result
 */
const ParticipantEnrichmentSchema = z.object({
  participantId: z.string().min(1),
  participantIndex: z.number().int().nonnegative(),
  participantRole: z.string().nullable().optional(),
  model: z.string().min(1),
});

export function enrichMessageWithParticipant(
  baseMetadata: DbMessageMetadata | undefined,
  participant: {
    id: string;
    modelId: string;
    role: string | null;
    index: number;
  },
): DbMessageMetadata {
  // Validate participant input first
  const enrichmentResult = ParticipantEnrichmentSchema.safeParse({
    participantId: participant.id,
    participantIndex: participant.index,
    participantRole: participant.role,
    model: participant.modelId,
  });

  if (!enrichmentResult.success) {
    throw new Error(`Invalid participant data for enrichment: ${enrichmentResult.error.message}`);
  }

  const base = baseMetadata || { role: 'assistant' as const };

  // Build enriched metadata with validated participant data
  return {
    ...base,
    ...enrichmentResult.data,
  } as DbMessageMetadata;
}

// ============================================================================
// Next.js Page Metadata Utilities
// ============================================================================

export type CreateMetadataProps = {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  siteName?: string;
  robots?: string;
  canonicalUrl?: string;
  keywords?: string[];
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
};

/**
 * Create Next.js Metadata for pages
 *
 * **PURPOSE**: Generate consistent SEO metadata across all pages
 * **USE CASE**: Used in generateMetadata() functions in page.tsx files
 *
 * @param props - Metadata properties
 * @param props.title - Page title (defaults to brand name)
 * @param props.description - Page description (defaults to brand description)
 * @param props.image - OG image path (defaults to /static/og-image.png)
 * @param props.url - Page URL path (defaults to /)
 * @param props.type - Page type for OpenGraph (defaults to website)
 * @param props.siteName - Site name for OpenGraph (defaults to brand name)
 * @param props.robots - Robots meta directive (defaults to index, follow)
 * @param props.canonicalUrl - Canonical URL for SEO
 * @param props.keywords - SEO keywords array
 * @param props.author - Content author (defaults to brand name)
 * @param props.publishedTime - ISO timestamp for article publish date
 * @param props.modifiedTime - ISO timestamp for article modification date
 * @returns Next.js Metadata object with OpenGraph and Twitter cards
 *
 * @example
 * ```typescript
 * export async function generateMetadata(): Promise<Metadata> {
 *   return createMetadata({
 *     title: 'My Page',
 *     description: 'Page description',
 *     url: '/my-page',
 *     canonicalUrl: '/my-page',
 *   });
 * }
 * ```
 */
export function createMetadata({
  title = BRAND.fullName,
  description = BRAND.description,
  image = '/static/og-image.png',
  url = '/',
  type = 'website',
  siteName = BRAND.fullName,
  robots = 'index, follow',
  canonicalUrl,
  keywords = ['AI collaboration', 'dashboard', 'brainstorming', 'multiple models', 'Roundtable'],
  author = BRAND.name,
  publishedTime,
  modifiedTime,
}: CreateMetadataProps = {}): Metadata {
  const baseUrl = getBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
  const fullImage = image.startsWith('http') ? image : `${baseUrl}${image}`;

  const openGraph: Metadata['openGraph'] = {
    title,
    description,
    url: fullUrl,
    siteName,
    images: [
      {
        url: fullImage,
        width: 1200,
        height: 630,
        alt: title,
      },
    ],
    locale: 'en_US',
    type,
    ...(publishedTime && { publishedTime }),
    ...(modifiedTime && { modifiedTime }),
  };

  const twitter: Metadata['twitter'] = {
    card: 'summary_large_image',
    title,
    description,
    images: [fullImage],
    creator: '@roundtablenow',
    site: '@roundtablenow',
  };

  return {
    title,
    description,
    keywords: keywords.join(', '),
    authors: [{ name: author }],
    openGraph,
    twitter,
    robots,
    alternates: {
      canonical: canonicalUrl || fullUrl,
    },
    other: {
      'theme-color': BRAND.colors.primary,
      'msapplication-TileColor': BRAND.colors.primary,
      'apple-mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-status-bar-style': 'default',
      'format-detection': 'telephone=no',
    },
  };
}
