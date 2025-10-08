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

import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { UIMessage } from 'ai';
import { convertToModelMessages, generateText, streamText } from 'ai';

import { createError } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import { apiLogger } from '@/api/middleware/hono-logger';
import type { ApiEnv } from '@/api/types';
import type { AIModel } from '@/lib/ai/models-config';
import { AI_MODELS, getModelById, isValidOpenRouterModelId } from '@/lib/ai/models-config';

/**
 * OpenRouter service configuration
 */
type OpenRouterServiceConfig = {
  apiKey: string;
  appName?: string;
  appUrl?: string;
};

/**
 * Text generation parameters using AI SDK v5 UIMessage format
 */
export type GenerateTextParams = {
  modelId: string;
  messages: UIMessage[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
};

/**
 * Streaming text generation parameters
 */
export type StreamTextParams = GenerateTextParams & {
  onFinish?: (result: { text: string; usage?: { totalTokens: number } }) => void;
};

/**
 * OpenRouter service class
 * Singleton pattern - initialized once with environment config
 */
class OpenRouterService {
  private client: ReturnType<typeof createOpenRouter> | null = null;

  /**
   * Initialize OpenRouter client with configuration
   * Must be called before using any OpenRouter methods
   */
  initialize(config: OpenRouterServiceConfig): void {
    if (this.client) {
      return; // Already initialized
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
   * Get model configuration by ID
   * Throws if model not found, disabled, or not a valid OpenRouter model
   */
  private getModelConfig(modelId: string): AIModel {
    // First validate against known OpenRouter models
    if (!isValidOpenRouterModelId(modelId)) {
      apiLogger.error('Invalid OpenRouter model ID', {
        requestedModelId: modelId,
        message: 'Model ID not found in OpenRouter API. Check https://openrouter.ai/api/v1/models',
      });

      const context: ErrorContext = {
        errorType: 'validation',
        field: 'modelId',
      };
      throw createError.badRequest(
        `Invalid OpenRouter model ID: ${modelId}. Check https://openrouter.ai/api/v1/models for valid model IDs.`,
        context,
      );
    }

    // Then check if it exists in our configuration
    const model = getModelById(modelId);

    if (!model) {
      apiLogger.error('Model not found in configuration', {
        requestedModelId: modelId,
      });

      const context: ErrorContext = {
        errorType: 'resource',
        resource: 'model',
        resourceId: modelId,
        service: 'openrouter',
      };
      throw createError.notFound(`Model ${modelId} not found in configuration`, context);
    }

    // Finally check if it's enabled
    if (!model.isEnabled) {
      const context: ErrorContext = {
        errorType: 'validation',
        field: 'modelId',
      };
      throw createError.badRequest(`Model ${modelId} is disabled`, context);
    }

    return model;
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
    const modelConfig = this.getModelConfig(params.modelId);

    // Build system prompt with simplified plain text guidance
    const systemPrompt = params.system
      ? `${this.PLAIN_TEXT_INSTRUCTION}\n\n${params.system}`
      : this.PLAIN_TEXT_INSTRUCTION;

    try {
      const result = await generateText({
        model: client.chat(modelConfig.modelId),
        messages: convertToModelMessages(params.messages),
        system: systemPrompt,
        temperature: params.temperature ?? modelConfig.defaultSettings.temperature,
        maxOutputTokens: params.maxTokens ?? modelConfig.defaultSettings.maxTokens,
        topP: params.topP ?? modelConfig.defaultSettings.topP,
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
      apiLogger.error('OpenRouter text generation failed', {
        modelId: params.modelId,
        error: error instanceof Error ? error.message : String(error),
      });

      const context: ErrorContext = {
        errorType: 'external_service',
        service: 'openrouter',
        operation: 'generate_text',
        resourceId: params.modelId,
      };
      throw createError.internal('Failed to generate text from OpenRouter', context);
    }
  }

  /**
   * Generate streaming text completion from a single model
   * Following AI SDK v5 patterns - uses UIMessage format and convertToModelMessages()
   */
  streamText(params: StreamTextParams): ReadableStream {
    const client = this.getClient();
    const modelConfig = this.getModelConfig(params.modelId);

    // Build system prompt with simplified plain text guidance
    const systemPrompt = params.system
      ? `${this.PLAIN_TEXT_INSTRUCTION}\n\n${params.system}`
      : this.PLAIN_TEXT_INSTRUCTION;

    try {
      const result = streamText({
        model: client.chat(modelConfig.modelId),
        messages: convertToModelMessages(params.messages),
        system: systemPrompt,
        temperature: params.temperature ?? modelConfig.defaultSettings.temperature,
        maxOutputTokens: params.maxTokens ?? modelConfig.defaultSettings.maxTokens,
        topP: params.topP ?? modelConfig.defaultSettings.topP,
        onFinish: params.onFinish
          ? ({ text, usage }) => {
              params.onFinish?.({ text, usage: { totalTokens: usage.totalTokens ?? 0 } });
            }
          : undefined,
      });

      return result.toTextStreamResponse().body as ReadableStream;
    } catch (error) {
      apiLogger.error('OpenRouter streaming failed', {
        modelId: params.modelId,
        error: error instanceof Error ? error.message : String(error),
      });

      const context: ErrorContext = {
        errorType: 'external_service',
        service: 'openrouter',
        operation: 'stream_text',
        resourceId: params.modelId,
      };
      throw createError.internal('Failed to stream text from OpenRouter', context);
    }
  }

  /**
   * Stream UI messages using AI SDK v5
   * Returns Response suitable for Hono route handlers with automatic SSE streaming
   *
   * This method follows AI SDK v5 patterns:
   * - Accepts UIMessage[] format for seamless integration with useChat
   * - Uses convertToModelMessages() for type-safe conversion
   * - Returns Response with .toUIMessageStreamResponse() for automatic SSE handling
   *
   * @example
   * ```typescript
   * return openRouterService.streamUIMessages({
   *   modelId: 'anthropic/claude-3-5-sonnet',
   *   messages: uiMessages,
   *   system: 'You are a helpful assistant',
   *   temperature: 0.7,
   *   onFinish: async ({ text }) => {
   *     await saveToDatabase(text);
   *   },
   * });
   * ```
   */
  streamUIMessages(params: {
    modelId: string;
    messages: UIMessage[];
    system?: string;
    temperature?: number;
    topP?: number;
    onFinish?: (result: { text: string; usage?: { totalTokens: number } }) => Promise<void> | void;
  }): Response {
    const client = this.getClient();
    const modelConfig = this.getModelConfig(params.modelId);

    // Build system prompt with simplified plain text guidance
    const systemPrompt = params.system
      ? `${this.PLAIN_TEXT_INSTRUCTION}\n\n${params.system}`
      : this.PLAIN_TEXT_INSTRUCTION;

    try {
      const result = streamText({
        model: client.chat(modelConfig.modelId),
        messages: convertToModelMessages(params.messages),
        system: systemPrompt,
        temperature: params.temperature ?? modelConfig.defaultSettings.temperature,
        topP: params.topP ?? modelConfig.defaultSettings.topP,
        onFinish: params.onFinish
          ? ({ text, usage }) => {
              params.onFinish?.({ text, usage: { totalTokens: usage.totalTokens ?? 0 } });
            }
          : undefined,
      });

      return result.toUIMessageStreamResponse();
    } catch (error) {
      apiLogger.error('OpenRouter UI message streaming failed', {
        modelId: params.modelId,
        error: error instanceof Error ? error.message : String(error),
      });

      const context: ErrorContext = {
        errorType: 'external_service',
        service: 'openrouter',
        operation: 'stream_ui_messages',
        resourceId: params.modelId,
      };
      throw createError.internal('Failed to stream UI messages from OpenRouter', context);
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

  /**
   * Validate model supports required capabilities
   */
  validateModelCapabilities(
    modelId: string,
    requiredCapabilities: {
      streaming?: boolean;
      vision?: boolean;
      reasoning?: boolean;
    },
  ): { valid: boolean; missing: string[] } {
    const model = getModelById(modelId);

    if (!model) {
      return { valid: false, missing: ['model_not_found'] };
    }

    const missing: string[] = [];

    if (requiredCapabilities.streaming && !model.capabilities.streaming) {
      missing.push('streaming');
    }
    if (requiredCapabilities.vision && !model.capabilities.vision) {
      missing.push('vision');
    }
    if (requiredCapabilities.reasoning && !model.capabilities.reasoning) {
      missing.push('reasoning');
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Get available models for selection
   */
  getAvailableModels(): AIModel[] {
    return AI_MODELS.filter(model => model.isEnabled);
  }

  /**
   * Get models by category
   */
  getModelsByCategory(category: 'research' | 'reasoning' | 'general' | 'creative'): AIModel[] {
    return AI_MODELS.filter(
      model => model.isEnabled && model.metadata.category === category,
    );
  }
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
