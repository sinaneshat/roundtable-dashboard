/**
 * UI Message Schemas - AI SDK v5 Compatible Message Structure
 *
 * ✅ SINGLE SOURCE OF TRUTH: UIMessage schema for validation
 *
 * Provides runtime validation for AI SDK UIMessage format.
 * Used for validating messages from database before sending to client.
 *
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-ui/ui-message
 */

import { z } from 'zod';

import { UIMessageMetadataSchema } from './message-metadata';
import { MessagePartSchema } from './message-schemas';

// ============================================================================
// UI MESSAGE SCHEMA
// ============================================================================

/**
 * ✅ UIMessage schema - AI SDK v5 compatible message structure
 *
 * Validates message structure for:
 * - Database to UIMessage conversion
 * - API request/response validation
 * - Frontend message rendering
 *
 * NOTE: AI SDK UIMessage only supports 'user', 'assistant', 'system' roles.
 * Tool invocations are handled via toolInvocations array, not role='tool'.
 */
export const UIMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().optional(), // Legacy text content
  parts: z.array(MessagePartSchema).optional(), // Modern message parts
  metadata: UIMessageMetadataSchema,
  createdAt: z.union([z.string().datetime(), z.date()]).optional(),
  toolInvocations: z.array(z.unknown()).optional(), // Tool invocation data
  annotations: z.array(z.unknown()).optional(), // Additional annotations
});

export type UIMessage = z.infer<typeof UIMessageSchema>;

// ============================================================================
// UI MESSAGE ARRAY SCHEMA
// ============================================================================

/**
 * ✅ Array of UIMessages with validation
 */
export const UIMessagesSchema = z.array(UIMessageSchema);

export type UIMessages = z.infer<typeof UIMessagesSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * ✅ VALIDATOR: Validate a single UIMessage
 * @throws {z.ZodError} if validation fails
 */
export function validateUIMessage(message: unknown): UIMessage {
  return UIMessageSchema.parse(message);
}

/**
 * ✅ SAFE VALIDATOR: Validate a single UIMessage without throwing
 * @returns {success: true, data: UIMessage} or {success: false, error: ZodError}
 */
export function safeValidateUIMessage(message: unknown) {
  return UIMessageSchema.safeParse(message);
}

/**
 * ✅ VALIDATOR: Validate an array of UIMessages
 * @throws {z.ZodError} if validation fails
 */
export function validateUIMessagesArray(messages: unknown): UIMessages {
  return UIMessagesSchema.parse(messages);
}

/**
 * ✅ TYPE GUARD: Check if value is a valid UIMessage
 */
export function isUIMessage(value: unknown): value is UIMessage {
  return UIMessageSchema.safeParse(value).success;
}

/**
 * ✅ TYPE GUARD: Check if value is a valid UIMessages array
 */
export function isUIMessagesArray(value: unknown): value is UIMessages {
  return UIMessagesSchema.safeParse(value).success;
}

// ============================================================================
// CONVERSION HELPERS
// ============================================================================

/**
 * ✅ CONVERTER: Create UIMessage from partial data with validation
 * Provides defaults for optional fields
 */
export function createUIMessage(data: {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content?: string;
  parts?: unknown[];
  metadata?: unknown;
  createdAt?: string | Date;
}): UIMessage {
  // Validate parts if provided
  const validatedParts = data.parts
    ? data.parts.map(part => MessagePartSchema.parse(part))
    : undefined;

  // Validate metadata if provided
  const validatedMetadata = data.metadata
    ? UIMessageMetadataSchema.parse(data.metadata)
    : null;

  return UIMessageSchema.parse({
    id: data.id,
    role: data.role,
    content: data.content,
    parts: validatedParts,
    metadata: validatedMetadata,
    createdAt: data.createdAt,
  });
}

/**
 * ✅ CONVERTER: Convert text content to message parts format
 * Migrates legacy content field to modern parts array
 */
export function contentToParts(content: string): Array<{ type: 'text'; text: string }> {
  if (!content) {
    return [];
  }
  return [{ type: 'text', text: content }];
}

/**
 * ✅ CONVERTER: Extract content from message parts
 * Converts modern parts array back to legacy content string
 */
export function partsToContent(parts: unknown[]): string {
  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .filter((part): part is { type: 'text'; text: string } =>
      typeof part === 'object'
      && part !== null
      && 'type' in part
      && part.type === 'text'
      && 'text' in part
      && typeof part.text === 'string',
    )
    .map(part => part.text)
    .join(' ');
}
