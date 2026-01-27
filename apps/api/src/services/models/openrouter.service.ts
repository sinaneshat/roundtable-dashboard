import { z } from '@hono/zod-openapi';
import type { LanguageModelUsage, UIMessage } from 'ai';

import { createError } from '@/common/error-handling';
import type { ErrorContext } from '@/core';
import { getAppBaseUrl } from '@/lib/config/base-urls';
// PERF FIX: Import directly to avoid circular dependency chain through billing barrel
import { DEFAULT_AI_PARAMS } from '@/services/billing/product-logic.service';
import type { ApiEnv } from '@/types';

// ============================================================================
// LAZY AI SDK & OPENROUTER LOADING
// ============================================================================

// Cache modules to avoid repeated dynamic imports
// This is critical for Cloudflare Workers which have a 400ms startup limit
let aiSdkModule: typeof import('ai') | null = null;
let openRouterModule: typeof import('@openrouter/ai-sdk-provider') | null = null;

async function getAiSdk() {
  if (!aiSdkModule) {
    aiSdkModule = await import('ai');
  }
  return aiSdkModule;
}

async function getOpenRouterSdk() {
  if (!openRouterModule) {
    openRouterModule = await import('@openrouter/ai-sdk-provider');
  }
  return openRouterModule;
}

function isValidOpenRouterModelId(modelId: string) {
  return /^[\w-]+\/[\w.-]+$/.test(modelId);
}

const OpenRouterServiceConfigSchema = z.object({
  apiKey: z.string().min(1),
  appName: z.string().optional(),
  appUrl: z.string().url().optional(),
}).strict();

export type OpenRouterServiceConfig = z.infer<typeof OpenRouterServiceConfigSchema>;

export const GenerateTextParamsSchema = z.object({
  maxTokens: z.number().int().positive().optional(),
  messages: z.array(z.custom<UIMessage>((data) => {
    return typeof data === 'object' && data !== null && 'id' in data && 'role' in data;
  })),
  modelId: z.string().min(1),
  system: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
}).strict();

export type GenerateTextParams = z.infer<typeof GenerateTextParamsSchema>;

// Type for the OpenRouter client (inferred from createOpenRouter return type)
type OpenRouterClient = Awaited<ReturnType<typeof getOpenRouterSdk>>['createOpenRouter'] extends
(...args: infer _A) => infer R ? R : never;

class OpenRouterService {
  private client: OpenRouterClient | null = null;
  private config: OpenRouterServiceConfig | null = null;

  initialize(config: OpenRouterServiceConfig) {
    if (this.config) {
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

    // Store config for lazy client creation
    this.config = validationResult.data;
  }

  public async getClient(): Promise<OpenRouterClient> {
    if (!this.config) {
      const context: ErrorContext = {
        errorType: 'configuration',
        service: 'openrouter',
      };
      throw createError.internal('OpenRouter service not initialized. Call initialize() first.', context);
    }

    // Lazy create client on first use
    if (!this.client) {
      const { createOpenRouter } = await getOpenRouterSdk();
      this.client = createOpenRouter({
        apiKey: this.config.apiKey,
        headers: {
          'HTTP-Referer': this.config.appUrl || getAppBaseUrl(),
          'X-Title': this.config.appName || 'Roundtable AI Chat',
        },
      });
    }

    return this.client;
  }

  private validateModelId(modelId: string) {
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
    // ✅ LAZY LOAD AI SDK & OpenRouter: Load at method invocation, not module startup
    const { convertToModelMessages, generateText } = await getAiSdk();

    const client = await this.getClient();
    this.validateModelId(params.modelId);

    const systemPrompt = params.system
      ? `${this.PLAIN_TEXT_INSTRUCTION}\n\n${params.system}`
      : this.PLAIN_TEXT_INSTRUCTION;

    try {
      const result = await generateText({
        maxOutputTokens: params.maxTokens ?? DEFAULT_AI_PARAMS.maxTokens,
        messages: await convertToModelMessages(params.messages),
        model: client.chat(params.modelId),
        // ✅ MIDDLE-OUT TRANSFORM: Enable automatic context compression
        providerOptions: {
          openrouter: {
            transforms: ['middle-out'],
          },
        },
        system: systemPrompt,
        temperature: params.temperature ?? DEFAULT_AI_PARAMS.temperature,
        topP: params.topP ?? DEFAULT_AI_PARAMS.topP,
      });

      return {
        finishReason: result.finishReason,
        text: result.text,
        usage: result.usage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const context: ErrorContext = {
        errorType: 'external_service',
        operation: 'generate_text',
        resourceId: params.modelId,
        service: 'openrouter',
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

export function initializeOpenRouter(env: ApiEnv['Bindings']) {
  openRouterService.initialize({
    apiKey: env.OPENROUTER_API_KEY,
    appName: env.APP_NAME || 'Roundtable AI Chat',
    appUrl: getAppBaseUrl(),
  });
}
