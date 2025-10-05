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
import { AI_MODELS, getModelById } from '@/lib/ai/models-config';

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

    apiLogger.info('OpenRouter service initialized', {
      appName: config.appName,
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
   * Throws if model not found or disabled
   */
  private getModelConfig(modelId: string): AIModel {
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

    // Build system prompt with plain text enforcement
    const plainTextInstruction = 'IMPORTANT: You must respond ONLY in plain text. Do NOT use Markdown, HTML, or any markup language. Do NOT use formatting like **bold**, *italic*, `code`, or [links]. Write naturally as if speaking in a conversation. Use simple punctuation and line breaks only.';
    const systemPrompt = params.system
      ? `${plainTextInstruction}\n\n${params.system}`
      : plainTextInstruction;

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

    try {
      const result = streamText({
        model: client.chat(modelConfig.modelId),
        messages: convertToModelMessages(params.messages),
        system: params.system,
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

    // Build system prompt with plain text enforcement
    const plainTextInstruction = 'IMPORTANT: You must respond ONLY in plain text. Do NOT use Markdown, HTML, or any markup language. Do NOT use formatting like **bold**, *italic*, `code`, or [links]. Write naturally as if speaking in a conversation. Use simple punctuation and line breaks only.';
    const systemPrompt = params.system
      ? `${plainTextInstruction}\n\n${params.system}`
      : plainTextInstruction;

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
  // Multi-Model Orchestration
  // ============================================================================

  /**
   * Orchestrate multiple models in a conversation
   * Each participant responds in priority order with full awareness of other participants
   * Uses AI SDK v5 UIMessage format
   */
  async orchestrateMultiModel(
    participants: Array<{
      participantId: string;
      modelId: string;
      role?: string | null;
      priority: number;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    }>,
    messages: UIMessage[],
    mode: 'analyzing' | 'brainstorming' | 'debating' | 'solving',
  ): Promise<Array<{
      participantId: string;
      modelId: string;
      role?: string | null;
      text: string;
      finishReason: string;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    }>> {
    // Sort participants by priority (lower number = higher priority)
    const sortedParticipants = [...participants].sort((a, b) => a.priority - b.priority);

    // Build mode-specific system context
    const modeContext = this.getModeSystemContext(mode);

    // Build collaborative context describing all participants
    const collaborativeContext = this.buildCollaborativeContext(sortedParticipants, mode);

    const results: Array<{
      participantId: string;
      modelId: string;
      role?: string | null;
      text: string;
      finishReason: string;
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    }> = [];

    // Accumulate messages for context (using UIMessage format)
    const conversationMessages: UIMessage[] = [...messages];

    // Execute each participant in priority order
    for (const participant of sortedParticipants) {
      const system = this.buildSystemPrompt({
        role: participant.role,
        mode,
        modeContext,
        collaborativeContext,
        participantCount: sortedParticipants.length,
        customPrompt: participant.systemPrompt,
      });

      try {
        const result = await this.generateText({
          modelId: participant.modelId,
          messages: conversationMessages,
          system,
          temperature: participant.temperature,
          maxTokens: participant.maxTokens,
        });

        results.push({
          participantId: participant.participantId,
          modelId: participant.modelId,
          role: participant.role,
          text: result.text,
          finishReason: result.finishReason,
          usage: result.usage,
        });

        // Add this model's response to conversation context for next participant (UIMessage format)
        conversationMessages.push({
          id: `msg-${Date.now()}-${participant.participantId}`,
          role: 'assistant',
          parts: [
            {
              type: 'text',
              text: participant.role ? `[${participant.role}]: ${result.text}` : result.text,
            },
          ],
        });
      } catch (error) {
        apiLogger.error('Multi-model orchestration failed for participant', {
          participantId: participant.participantId,
          modelId: participant.modelId,
          error: error instanceof Error ? error.message : String(error),
        });

        // Continue with other participants even if one fails
        results.push({
          participantId: participant.participantId,
          modelId: participant.modelId,
          role: participant.role,
          text: `[Error: Failed to generate response${participant.role ? ` from ${participant.role}` : ''}]`,
          finishReason: 'error',
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
        });
      }
    }

    return results;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Plain text instruction to enforce plain text responses
   * Used across all AI interactions
   */
  private readonly PLAIN_TEXT_INSTRUCTION = 'IMPORTANT: You must respond ONLY in plain text. Do NOT use Markdown, HTML, or any markup language. Do NOT use formatting like **bold**, *italic*, `code`, or [links]. Write naturally as if speaking in a conversation. Use simple punctuation and line breaks only.';

  /**
   * Build system prompt for a participant based on role and mode
   * Now includes collaborative awareness of other participants
   */
  private buildSystemPrompt(params: {
    role?: string | null;
    mode: 'analyzing' | 'brainstorming' | 'debating' | 'solving';
    modeContext: string;
    collaborativeContext?: string;
    participantCount?: number;
    customPrompt?: string;
  }): string {
    const parts: string[] = [];

    // CRITICAL: Enforce plain text responses only
    parts.push(this.PLAIN_TEXT_INSTRUCTION);

    // Add collaborative awareness header
    if (params.participantCount && params.participantCount > 1) {
      const roleText = params.role ? `as "${params.role}"` : '';
      parts.push(`You are participating ${roleText} in a multi-AI collaborative discussion with ${params.participantCount} AI participants total.`);

      // Add collaborative context showing other participants
      if (params.collaborativeContext) {
        parts.push(params.collaborativeContext);
      }

      // Add round-based discussion awareness
      parts.push(`This is a round-based collaborative discussion where each AI participant contributes in turn. You will see responses from other AI participants and should build upon, challenge, or complement their ideas as appropriate for the ${params.mode} mode.`);
    } else if (params.role) {
      parts.push(`You are "${params.role}" in a collaborative AI discussion.`);
    }

    // Add mode-specific context
    parts.push(params.modeContext);

    // Add role-specific guidance if role is provided
    const roleGuidance = params.role ? this.getRoleGuidance(params.role) : '';
    if (roleGuidance) {
      parts.push(roleGuidance);
    }

    // Add custom prompt if provided
    if (params.customPrompt) {
      parts.push(params.customPrompt);
    }

    return parts.join('\n\n');
  }

  /**
   * Build collaborative context describing all participants
   * Makes each AI aware of other participants in the discussion
   */
  private buildCollaborativeContext(
    participants: Array<{
      participantId: string;
      modelId: string;
      role?: string | null;
      priority: number;
    }>,
    mode: string,
  ): string {
    if (participants.length <= 1) {
      return '';
    }

    const participantDescriptions = participants.map((p, index) => {
      const modelInfo = getModelById(p.modelId);
      const modelName = modelInfo?.name || p.modelId;
      const roleText = p.role ? `"${p.role}"` : 'an AI participant';
      return `${index + 1}. ${roleText} (${modelName})`;
    }).join('\n');

    return `**Collaborative Team:**\nYou are working with the following AI participants:\n${participantDescriptions}\n\nYou are all working together in ${mode} mode. Be aware of each other's contributions and respond accordingly. Reference other participants' ideas when building on them or presenting alternative perspectives.`;
  }

  /**
   * Get system context based on conversation mode
   */
  private getModeSystemContext(mode: 'analyzing' | 'brainstorming' | 'debating' | 'solving'): string {
    const contexts = {
      analyzing: 'Your task is to analyze the problem or topic from your unique perspective. Provide thorough analysis, identify key patterns, and surface important insights.',
      brainstorming: 'Your task is to generate creative ideas and explore possibilities. Build on others\' suggestions, think divergently, and propose novel approaches.',
      debating: 'Your task is to engage in constructive debate. Present arguments for your perspective, challenge assumptions respectfully, and help refine ideas through critical discussion.',
      solving: 'Your task is to work toward practical solutions. Focus on actionable steps, consider feasibility, and help the group converge on implementable answers.',
    };

    return contexts[mode];
  }

  /**
   * Get role-specific guidance for common roles
   */
  private getRoleGuidance(role: string): string | null {
    const roleGuidance: Record<string, string> = {
      'The Ideator': 'Generate creative and innovative ideas. Think outside the box and propose unconventional solutions.',
      'Devil\'s Advocate': 'Challenge assumptions and identify potential problems. Play the skeptic to stress-test ideas.',
      'Builder': 'Focus on practical implementation. Consider technical feasibility and how ideas can be built.',
      'Practical Evaluator': 'Assess ideas for practicality and real-world viability. Consider costs, resources, and constraints.',
      'Visionary Thinker': 'Think long-term and strategically. Consider future implications and transformative potential.',
      'Domain Expert': 'Apply specialized knowledge and expertise. Provide authoritative insights in your domain.',
      'User Advocate': 'Represent the end user\'s perspective. Focus on user needs, experience, and value.',
      'Implementation Strategist': 'Plan execution and deployment. Break down ideas into actionable steps and timelines.',
      'The Data Analyst': 'Ground discussions in data and evidence. Identify what metrics matter and how to measure success.',
    };

    return roleGuidance[role] || null;
  }

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
