/**
 * Models Configuration Service - SINGLE SOURCE OF TRUTH
 *
 * ✅ TOP 15 CURATED MODELS - Based on Dec 2025 LLM Leaderboards:
 * - Chatbot Arena rankings (lmarena.ai)
 * - OpenRouter usage statistics
 * - Artificial Analysis Intelligence Index
 *
 * ✅ MAX 3 PER PROVIDER: Only latest/greatest from each company
 * ✅ FREE MODELS: Included for dev mode cost optimization
 * ✅ MULTIMODAL: Best text/vision capable models
 *
 * @see /docs/backend-patterns.md - Service layer patterns
 */

import { z } from '@hono/zod-openapi';

import { ModelCategorySchema } from '@/api/core/enums';

// ============================================================================
// ZOD-BASED MODEL ENUMS - Single Source of Truth (15 models)
// ============================================================================

/**
 * ✅ MODEL ID ENUM: Top models + ALL free models for dev mode
 * Curated from LLM leaderboards + OpenRouter free tier
 */
export const ModelIdEnum = z.enum([
  // ========================================================================
  // PAID MODELS - Top performers from leaderboards
  // ========================================================================

  // Google (3) - #1 on Chatbot Arena, best multimodal
  'google/gemini-3-pro-preview-20251117', // Latest, top tier reasoning
  'google/gemini-2.5-pro', // High quality, 2M context
  'google/gemini-2.5-flash', // Fast, cost-efficient

  // OpenAI (3) - Most popular, best structured output
  'openai/gpt-4o', // Most popular chatbot model
  'openai/gpt-4o-mini', // Fast, cheap, great for dev
  'openai/o3-mini', // Reasoning model

  // Anthropic (3) - Best for complex tasks, safety-focused
  'anthropic/claude-sonnet-4.5', // Latest sonnet, balanced
  'anthropic/claude-opus-4.5', // Top tier reasoning
  'anthropic/claude-3.5-sonnet', // Reliable, widely adopted

  // xAI (2) - Top on OpenRouter rankings
  'x-ai/grok-4.1-fast:free', // #1 on OpenRouter by usage (free variant required as of Dec 2025)
  'x-ai/grok-code-fast-1', // Best for coding tasks

  // DeepSeek (1) - Best value paid
  'deepseek/deepseek-r1', // Top reasoning model

  // Qwen (1) - Rising star, competitive with GPT-4
  'qwen/qwen3-max', // Top Alibaba model

  // ========================================================================
  // FREE MODELS - All OpenRouter :free variants for dev mode
  // ========================================================================

  // DeepSeek Free (3) - Verified on OpenRouter Dec 2025
  'deepseek/deepseek-r1:free', // FREE - reasoning model
  'deepseek/deepseek-r1-0528:free', // FREE - latest R1
  'deepseek/deepseek-chat-v3-0324:free', // FREE - chat model

  // Meta Llama Free (1) - Verified on OpenRouter Dec 2025
  'meta-llama/llama-3.3-70b-instruct:free', // FREE - best open source

  // Google Free (1) - Note: gemini-2.5-pro-exp-03-25:free was deprecated
  'google/gemini-2.0-flash-exp:free', // FREE - experimental flash

  // Mistral Free (1) - Verified on OpenRouter Dec 2025
  'mistralai/mistral-small-3.1-24b-instruct-2503:free', // FREE - small model

  // NVIDIA Free (1) - Verified on OpenRouter Dec 2025
  'nvidia/nemotron-nano-9b-v2:free', // FREE - optimized model
]);

export type ModelId = z.infer<typeof ModelIdEnum>;

// ============================================================================
// MODEL PROVIDER ENUM
// ============================================================================

/**
 * ✅ PROVIDER ENUM: AI providers with models in catalog
 */
export const ModelProviderEnum = z.enum([
  'google',
  'openai',
  'anthropic',
  'x-ai',
  'deepseek',
  'meta-llama',
  'qwen',
  'mistralai',
  'nvidia',
]);

export type ModelProvider = z.infer<typeof ModelProviderEnum>;

// ============================================================================
// HARDCODED MODEL SCHEMA
// ============================================================================

export const HardcodedModelSchema = z.object({
  id: ModelIdEnum,
  name: z.string(),
  description: z.string().optional(),
  context_length: z.number(),
  created: z.number().optional(),
  pricing: z.object({
    prompt: z.string(),
    completion: z.string(),
  }),
  top_provider: z
    .object({
      context_length: z.number().nullable().optional(),
      max_completion_tokens: z.number().nullable().optional(),
      is_moderated: z.boolean().nullable().optional(),
    })
    .nullable()
    .optional(),
  per_request_limits: z
    .object({
      prompt_tokens: z.number().nullable().optional(),
      completion_tokens: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  architecture: z
    .object({
      modality: z.string().nullable().optional(),
      tokenizer: z.string().nullable().optional(),
      instruct_type: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  provider: ModelProviderEnum,
  category: ModelCategorySchema,
  capabilities: z.object({
    vision: z.boolean(),
    reasoning: z.boolean(),
    streaming: z.boolean(),
    tools: z.boolean(),
  }),
  pricing_display: z.object({
    input: z.string(),
    output: z.string(),
  }),
  is_free: z.boolean(),
  supports_vision: z.boolean(),
  is_reasoning_model: z.boolean(),
  supports_temperature: z.boolean(),
  supports_reasoning_stream: z.boolean(),
});

export type HardcodedModel = z.infer<typeof HardcodedModelSchema>;

// ============================================================================
// HARDCODED MODEL CATALOG (15 Top Models - Dec 2025)
// ============================================================================

/**
 * ✅ TOP 15 MODELS: Curated from LLM leaderboards
 * - Max 3 per provider
 * - Includes free variants for dev mode
 * - Based on Chatbot Arena, OpenRouter rankings, Artificial Analysis
 */
export const HARDCODED_MODELS: readonly HardcodedModel[] = [
  // ========================================================================
  // GOOGLE (3) - #1 on Chatbot Arena
  // ========================================================================
  {
    id: 'google/gemini-3-pro-preview-20251117',
    name: 'Gemini 3 Pro Preview',
    description: 'Google\'s flagship frontier model. #1 on Chatbot Arena. 1M context with top-tier reasoning.',
    context_length: 1000000,
    created: 1731888000,
    pricing: { prompt: '0.00000200', completion: '0.00001200' },
    top_provider: { context_length: 1000000, max_completion_tokens: 64000, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image+video+audio->text', tokenizer: 'Gemini', instruct_type: 'gemini' },
    provider: 'google',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$2/1M', output: '$12/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Google\'s advanced model with 1M token context. Excellent multimodal capabilities.',
    context_length: 1048576,
    created: 1709251200,
    pricing: { prompt: '0.00000125', completion: '0.00001000' },
    top_provider: { context_length: 1048576, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image+video+audio->text', tokenizer: 'Gemini', instruct_type: 'gemini' },
    provider: 'google',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$1.25/1M', output: '$10/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Fast, cost-efficient model. Great for high-volume tasks.',
    context_length: 1048576,
    created: 1709251200,
    pricing: { prompt: '0.00000030', completion: '0.00000250' },
    top_provider: { context_length: 1048576, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image+video+audio->text', tokenizer: 'Gemini', instruct_type: 'gemini' },
    provider: 'google',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$0.30/1M', output: '$2.50/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },

  // ========================================================================
  // OPENAI (3) - Best structured output
  // ========================================================================
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    description: 'OpenAI\'s most popular model. Best for structured output and complex tasks.',
    context_length: 128000,
    created: 1715385600,
    pricing: { prompt: '0.00000250', completion: '0.00001000' },
    top_provider: { context_length: 128000, max_completion_tokens: 16384, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text+image->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$2.50/1M', output: '$10/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast, cheap GPT-4o variant. Great for development and testing.',
    context_length: 128000,
    created: 1715385600,
    pricing: { prompt: '0.00000015', completion: '0.00000060' },
    top_provider: { context_length: 128000, max_completion_tokens: 16384, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text+image->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$0.15/1M', output: '$0.60/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
  {
    id: 'openai/o3-mini',
    name: 'o3 Mini',
    description: 'OpenAI\'s reasoning model. Excellent for math, coding, and logic.',
    context_length: 200000,
    created: 1738022400,
    pricing: { prompt: '0.00000110', completion: '0.00000440' },
    top_provider: { context_length: 200000, max_completion_tokens: 100000, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
    category: 'reasoning',
    capabilities: { vision: false, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$1.10/1M', output: '$4.40/1M' },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: true,
    supports_temperature: false,
    supports_reasoning_stream: true,
  },

  // ========================================================================
  // ANTHROPIC (3) - Best for complex tasks
  // ========================================================================
  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude 4.5 Sonnet',
    description: 'Anthropic\'s most advanced Sonnet. Optimized for agents and coding.',
    context_length: 1000000,
    created: 1727654400,
    pricing: { prompt: '0.00000300', completion: '0.00001500' },
    top_provider: { context_length: 1000000, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'Claude', instruct_type: 'claude' },
    provider: 'anthropic',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$3/1M', output: '$15/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
  {
    id: 'anthropic/claude-opus-4.5',
    name: 'Claude 4.5 Opus',
    description: 'Anthropic\'s frontier reasoning model. Best for complex software engineering.',
    context_length: 200000,
    created: 1732406400,
    pricing: { prompt: '0.00000500', completion: '0.00002500' },
    top_provider: { context_length: 200000, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'Claude', instruct_type: 'claude' },
    provider: 'anthropic',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$5/1M', output: '$25/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: 'Previous generation Sonnet. Reliable and widely adopted.',
    context_length: 200000,
    created: 1718841600,
    pricing: { prompt: '0.00000600', completion: '0.00003000' },
    top_provider: { context_length: 200000, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image->text', tokenizer: 'Claude', instruct_type: 'claude' },
    provider: 'anthropic',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$6/1M', output: '$30/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },

  // ========================================================================
  // XAI (2) - Top on OpenRouter
  // ========================================================================
  {
    id: 'x-ai/grok-4.1-fast:free',
    name: 'Grok 4.1 Fast (Free)',
    description: '#1 on OpenRouter by usage. xAI\'s fastest model with excellent reasoning. Free variant.',
    context_length: 2000000,
    created: 1731801600,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 2000000, max_completion_tokens: 131072, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image->text', tokenizer: 'Grok', instruct_type: 'grok' },
    provider: 'x-ai',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: 'FREE', output: 'FREE' },
    is_free: true,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'x-ai/grok-code-fast-1',
    name: 'Grok Code Fast',
    description: 'xAI\'s specialized coding model. ~190 tokens/sec. Best price-performance ratio.',
    context_length: 256000,
    created: 1724803200,
    pricing: { prompt: '0.00000020', completion: '0.00000150' },
    top_provider: { context_length: 256000, max_completion_tokens: 16384, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'Grok', instruct_type: 'grok' },
    provider: 'x-ai',
    category: 'general',
    capabilities: { vision: false, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$0.20/1M', output: '$1.50/1M' },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },

  // ========================================================================
  // DEEPSEEK (2) - Best value + free tier
  // ========================================================================
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    description: 'Top reasoning model. Competitive with o1 at fraction of the cost.',
    context_length: 163840,
    created: 1737504000,
    pricing: { prompt: '0.00000030', completion: '0.00000120' },
    top_provider: { context_length: 163840, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'DeepSeek', instruct_type: 'deepseek' },
    provider: 'deepseek',
    category: 'reasoning',
    capabilities: { vision: false, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$0.30/1M', output: '$1.20/1M' },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek R1 (Free)',
    description: 'FREE reasoning model. Perfect for development and testing.',
    context_length: 128000,
    created: 1737504000,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 128000, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'DeepSeek', instruct_type: 'deepseek' },
    provider: 'deepseek',
    category: 'reasoning',
    capabilities: { vision: false, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: 'FREE', output: 'FREE' },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },

  // ========================================================================
  // META (1) - Open source leader
  // ========================================================================
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B (Free)',
    description: 'FREE open source model. Best free option for general tasks.',
    context_length: 131072,
    created: 1733356800,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 131072, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'Llama', instruct_type: 'llama' },
    provider: 'meta-llama',
    category: 'general',
    capabilities: { vision: false, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: 'FREE', output: 'FREE' },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },

  // ========================================================================
  // QWEN (1) - Rising star
  // ========================================================================
  {
    id: 'qwen/qwen3-max',
    name: 'Qwen 3 Max',
    description: 'Alibaba\'s top model. Competitive with GPT-4 at lower cost.',
    context_length: 256000,
    created: 1735689600,
    pricing: { prompt: '0.00000120', completion: '0.00000600' },
    top_provider: { context_length: 256000, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'Qwen', instruct_type: 'qwen' },
    provider: 'qwen',
    category: 'general',
    capabilities: { vision: false, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$1.20/1M', output: '$6/1M' },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },

  // ========================================================================
  // ADDITIONAL FREE MODELS - OpenRouter :free variants for dev mode
  // ========================================================================

  // DeepSeek Free variants
  {
    id: 'deepseek/deepseek-r1-0528:free',
    name: 'DeepSeek R1 0528 (Free)',
    description: 'FREE - Latest DeepSeek R1 release. Best free reasoning model.',
    context_length: 128000,
    created: 1738108800,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 128000, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'DeepSeek', instruct_type: 'deepseek' },
    provider: 'deepseek',
    category: 'reasoning',
    capabilities: { vision: false, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: 'FREE', output: 'FREE' },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'deepseek/deepseek-chat-v3-0324:free',
    name: 'DeepSeek Chat V3 (Free)',
    description: 'FREE - DeepSeek chat model. Great for general conversations.',
    context_length: 128000,
    created: 1737504000,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 128000, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'DeepSeek', instruct_type: 'deepseek' },
    provider: 'deepseek',
    category: 'general',
    capabilities: { vision: false, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: 'FREE', output: 'FREE' },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
  // Google Free variants
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash Exp (Free)',
    description: 'FREE - Experimental Gemini Flash. Fast and multimodal.',
    context_length: 1000000,
    created: 1735689600,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 1000000, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image->text', tokenizer: 'Gemini', instruct_type: 'gemini' },
    provider: 'google',
    category: 'general',
    capabilities: { vision: true, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: 'FREE', output: 'FREE' },
    is_free: true,
    supports_vision: true,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
  // Note: google/gemini-2.5-pro-exp-03-25:free was deprecated by OpenRouter

  // Mistral Free - Verified on OpenRouter Dec 2025
  {
    id: 'mistralai/mistral-small-3.1-24b-instruct-2503:free',
    name: 'Mistral Small 3.1 (Free)',
    description: 'FREE - Mistral\'s efficient small model. Good for dev.',
    context_length: 32768,
    created: 1735689600,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 32768, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'Mistral', instruct_type: 'mistral' },
    provider: 'mistralai',
    category: 'general',
    capabilities: { vision: false, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: 'FREE', output: 'FREE' },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },

  // NVIDIA Free - Verified on OpenRouter Dec 2025
  {
    id: 'nvidia/nemotron-nano-9b-v2:free',
    name: 'Nemotron Nano 9B (Free)',
    description: 'FREE - NVIDIA optimized model. Fast inference.',
    context_length: 131072,
    created: 1735689600,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 131072, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'Llama', instruct_type: 'llama' },
    provider: 'nvidia',
    category: 'general',
    capabilities: { vision: false, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: 'FREE', output: 'FREE' },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
] as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getAllModels(): readonly HardcodedModel[] {
  return HARDCODED_MODELS;
}

export function getModelById(modelId: string): HardcodedModel | undefined {
  return HARDCODED_MODELS.find(model => model.id === modelId);
}

export function getModelsByProvider(
  provider: ModelProvider,
): readonly HardcodedModel[] {
  return HARDCODED_MODELS.filter(model => model.provider === provider);
}

export function getModelsByCategory(
  category: string,
): readonly HardcodedModel[] {
  return HARDCODED_MODELS.filter(model => model.category === category);
}

export function getAllModelIds(): readonly ModelId[] {
  return HARDCODED_MODELS.map(model => model.id);
}

export function isValidModelId(modelId: string): modelId is ModelId {
  return ModelIdEnum.safeParse(modelId).success;
}

export function getVisionModels(): readonly HardcodedModel[] {
  return HARDCODED_MODELS.filter(model => model.supports_vision);
}

export function getReasoningModels(): readonly HardcodedModel[] {
  return HARDCODED_MODELS.filter(model => model.is_reasoning_model);
}

export function getFreeModels(): readonly HardcodedModel[] {
  return HARDCODED_MODELS.filter(model => model.is_free);
}

/**
 * Get the best free model for dev mode operations (title generation, etc.)
 * Prefers non-reasoning models for faster responses
 */
export function getBestFreeModelForDev(): HardcodedModel {
  const freeModels = getFreeModels();
  // Prefer non-reasoning models for faster title generation
  const fastFreeModel = freeModels.find(m => !m.is_reasoning_model);
  return fastFreeModel || freeModels[0] || HARDCODED_MODELS[0]!;
}

export function getAllProviders(): readonly ModelProvider[] {
  return Array.from(new Set(HARDCODED_MODELS.map(model => model.provider)));
}

export function extractModeratorModelName(modelId: string): string {
  const model = getModelById(modelId);
  if (model) {
    return model.name;
  }

  const parts = modelId.split('/');
  const modelPart = parts[parts.length - 1] || modelId;

  return modelPart
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/\d{8}$/, '')
    .trim();
}
