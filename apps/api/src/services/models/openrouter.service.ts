import { z } from '@hono/zod-openapi';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModelUsage, UIMessage } from 'ai';
import { convertToModelMessages, generateText } from 'ai';

import { createError } from '@/common/error-handling';
import type { ErrorContext } from '@/core';
import { DEFAULT_AI_PARAMS } from '@/services/billing';
import type { ApiEnv } from '@/types';

function isValidOpenRouterModelId(modelId: string): boolean {
  return /^[\w-]+\/[\w.-]+$/.test(modelId);
}

const OpenRouterServiceConfigSchema = z.object({
  apiKey: z.string().min(1),
  appName: z.string().optional(),
  appUrl: z.string().url().optional(),
});

export type OpenRouterServiceConfig = z.infer<typeof OpenRouterServiceConfigSchema>;

export const GenerateTextParamsSchema = z.object({
  modelId: z.string().min(1),
  messages: z.array(z.custom<UIMessage>((data) => {
    return typeof data === 'object' && data !== null && 'id' in data && 'role' in data;
  })),
  system: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
});

export type GenerateTextParams = z.infer<typeof GenerateTextParamsSchema>;

class OpenRouterService {
  private client: ReturnType<typeof createOpenRouter> | null = null;

  initialize(config: OpenRouterServiceConfig): void {
    if (this.client) {
      return;
    }

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

  async generateText(params: GenerateTextParams): Promise<{
    text: string;
    finishReason: string;
    usage: LanguageModelUsage;
  }> {
    const client = this.getClient();
    this.validateModelId(params.modelId);

    const systemPrompt = params.system
      ? `${this.PLAIN_TEXT_INSTRUCTION}\n\n${params.system}`
      : this.PLAIN_TEXT_INSTRUCTION;

    try {
      const result = await generateText({
        model: client.chat(params.modelId),
        messages: await convertToModelMessages(params.messages),
        system: systemPrompt,
        temperature: params.temperature ?? DEFAULT_AI_PARAMS.temperature,
        maxOutputTokens: params.maxTokens ?? DEFAULT_AI_PARAMS.maxTokens,
        topP: params.topP ?? DEFAULT_AI_PARAMS.topP,
      });

      return {
        text: result.text,
        finishReason: result.finishReason,
        usage: result.usage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const context: ErrorContext = {
        errorType: 'external_service',
        service: 'openrouter',
        operation: 'generate_text',
        resourceId: params.modelId,
      };

      throw createError.internal(
        `Failed to generate text from OpenRouter (${params.modelId}): ${errorMessage}`,
        context,
      );
    }
  }

  private readonly PLAIN_TEXT_INSTRUCTION = 'Please respond in clear, natural language. Avoid heavy markdown formatting when possible.';
}

export const openRouterService = new OpenRouterService();

export function initializeOpenRouter(env: ApiEnv['Bindings']): void {
  openRouterService.initialize({
    apiKey: env.OPENROUTER_API_KEY,
    appName: env.APP_NAME || 'Roundtable AI Chat',
    appUrl: 'https://roundtable.now',
  });
}
