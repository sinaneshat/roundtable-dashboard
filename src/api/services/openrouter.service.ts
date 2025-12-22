/**
 * OpenRouter AI Service
 *
 * Handles all OpenRouter API interactions for multi-model AI chat.
 * Provides type-safe methods for:
 * - Model text generation with streaming support
 * - Multi-model orchestration
 * - Message formatting and conversation management
 *
 * Based on AI SDK v5 patterns from official documentation
 */

/**
 * OFFICIAL AI SDK IMPORTS
 * Following patterns from: https://sdk.vercel.ai/docs
 */
import { z } from '@hono/zod-openapi';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { UIMessage } from 'ai';
import { convertToModelMessages, generateText } from 'ai';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import { DEFAULT_AI_PARAMS } from '@/api/services/product-logic.service';
import type { ApiEnv } from '@/api/types';

/**
 * Validate OpenRouter model ID format
 * Format: "provider/model-name" (e.g., "anthropic/claude-3.5-sonnet")
 */
function isValidOpenRouterModelId(modelId: string): boolean {
  return /^[\w-]+\/[\w.-]+$/.test(modelId);
}

// ============================================================================
// ZOD SCHEMAS (Single Source of Truth)
// ============================================================================

/**
 * OpenRouter service configuration schema
 * Used for runtime validation when initializing the service
 */
const OpenRouterServiceConfigSchema = z.object({
  apiKey: z.string().min(1),
  appName: z.string().optional(),
  appUrl: z.string().url().optional(),
});

export type OpenRouterServiceConfig = z.infer<typeof OpenRouterServiceConfigSchema>;

/**
 * Text generation parameters schema
 * Uses z.custom() for AI SDK's UIMessage type which is a complex generic
 *
 * AI SDK provides runtime validation via validateUIMessages()
 */
export const GenerateTextParamsSchema = z.object({
  modelId: z.string().min(1),
  messages: z.array(z.custom<UIMessage>((data) => {
    // Basic validation - AI SDK's validateUIMessages() does full validation
    return typeof data === 'object' && data !== null && 'id' in data && 'role' in data;
  })),
  system: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
});

export type GenerateTextParams = z.infer<typeof GenerateTextParamsSchema>;

/**
 * OpenRouter service class
 * Singleton pattern - initialized once with environment config
 */
class OpenRouterService {
  private client: ReturnType<typeof createOpenRouter> | null = null;

  /**
   * Initialize OpenRouter client with configuration
   * Must be called before using any OpenRouter methods
   *
   * ✅ ZOD VALIDATION: Config validated at runtime
   */
  initialize(config: OpenRouterServiceConfig): void {
    if (this.client) {
      return; // Already initialized
    }

    // ✅ Runtime validation with Zod
    const validationResult = OpenRouterServiceConfigSchema.safeParse(config);
    if (!validationResult.success) {
      const context: ErrorContext = {
        errorType: 'configuration',
        service: 'openrouter',
      };
      throw createError.internal(
        `Invalid OpenRouter configuration: ${validationResult.error.message}`,
        context,
      );
    }

    this.client = createOpenRouter({
      apiKey: config.apiKey,
      headers: {
        'HTTP-Referer': config.appUrl || 'https://roundtable.now',
        'X-Title': config.appName || 'Roundtable AI Chat',
      },
    });
  }

  /**
   * Get initialized OpenRouter client
   * Throws if not initialized
   *
   * Public for advanced use cases like custom streaming patterns
   */
  public getClient(): ReturnType<typeof createOpenRouter> {
    if (!this.client) {
      const context: ErrorContext = {
        errorType: 'configuration',
        service: 'openrouter',
      };
      throw createError.internal('OpenRouter service not initialized. Call initialize() first.', context);
    }
    return this.client;
  }

  /**
   * Validate model ID format
   * ✅ SINGLE SOURCE OF TRUTH: OpenRouter API is the authority on what models exist
   * We only validate format here - OpenRouter API will error if model doesn't exist
   */
  private validateModelId(modelId: string): void {
    if (!isValidOpenRouterModelId(modelId)) {
      const context: ErrorContext = {
        errorType: 'validation',
        field: 'modelId',
      };
      throw createError.badRequest(
        `Invalid model ID format: ${modelId}. Must be in format provider/model-name`,
        context,
      );
    }
  }

  // ============================================================================
  // Single Model Operations
  // ============================================================================

  /**
   * Generate text completion from a single model (non-streaming)
   * Following AI SDK v5 patterns - uses UIMessage format and convertToModelMessages()
   */
  async generateText(params: GenerateTextParams): Promise<{
    text: string;
    finishReason: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    const client = this.getClient();

    // ✅ Validate model ID format only - OpenRouter API will error if model doesn't exist
    this.validateModelId(params.modelId);

    // Build system prompt with simplified plain text guidance
    const systemPrompt = params.system
      ? `${this.PLAIN_TEXT_INSTRUCTION}\n\n${params.system}`
      : this.PLAIN_TEXT_INSTRUCTION;

    try {
      const result = await generateText({
        model: client.chat(params.modelId),
        messages: convertToModelMessages(params.messages),
        system: systemPrompt,
        // Use provided params or defaults from consolidated config
        temperature: params.temperature ?? DEFAULT_AI_PARAMS.temperature,
        maxOutputTokens: params.maxTokens ?? DEFAULT_AI_PARAMS.maxTokens,
        topP: params.topP ?? DEFAULT_AI_PARAMS.topP,
      });

      return {
        text: result.text,
        finishReason: result.finishReason,
        usage: {
          promptTokens: result.usage.inputTokens ?? 0,
          completionTokens: result.usage.outputTokens ?? 0,
          totalTokens: result.usage.totalTokens ?? 0,
        },
      };
    } catch (error) {
      // ✅ PRESERVE ACTUAL ERROR: Include original error message for debugging
      const errorMessage = error instanceof Error ? error.message : String(error);

      const context: ErrorContext = {
        errorType: 'external_service',
        service: 'openrouter',
        operation: 'generate_text',
        resourceId: params.modelId,
      };

      // Include actual error details in the thrown error
      throw createError.internal(
        `Failed to generate text from OpenRouter (${params.modelId}): ${errorMessage}`,
        context,
      );
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Simplified plain text guidance
   * Gentle reminder to avoid heavy formatting without being overly restrictive
   *
   * NOTE: For multi-participant streaming, use centralized configuration from
   * @/lib/ai/models-config instead of this service-level constant
   */
  private readonly PLAIN_TEXT_INSTRUCTION = 'Please respond in clear, natural language. Avoid heavy markdown formatting when possible.';
}

/**
 * Singleton instance
 */
export const openRouterService = new OpenRouterService();

/**
 * Initialize OpenRouter service from environment
 * Must be called before using openRouterService
 */
export function initializeOpenRouter(env: ApiEnv['Bindings']): void {
  openRouterService.initialize({
    apiKey: env.OPENROUTER_API_KEY,
    appName: env.NEXT_PUBLIC_APP_NAME || 'Roundtable AI Chat',
    appUrl: env.NEXT_PUBLIC_APP_URL || 'https://roundtable.now',
  });
}
