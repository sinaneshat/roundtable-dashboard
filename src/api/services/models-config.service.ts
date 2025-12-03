/**
 * Models Configuration Service - SINGLE SOURCE OF TRUTH
 *
 * ✅ TOP 15 VERIFIED MODELS from Dec 2025 OpenRouter Rankings:
 * - Exact model IDs verified from openrouter.ai/rankings
 * - 3 models per major provider (xAI, Anthropic, Google, DeepSeek, OpenAI)
 * - Sorted by actual usage/popularity on OpenRouter
 *
 * @see https://openrouter.ai/rankings
 * @see /docs/backend-patterns.md - Service layer patterns
 */

import { z } from '@hono/zod-openapi';

import { ModelCategorySchema } from '@/api/core/enums';

// ============================================================================
// ZOD-BASED MODEL ENUMS - Verified OpenRouter Model IDs (15 models)
// ============================================================================

/**
 * ✅ MODEL ID ENUM: Verified from OpenRouter Dec 2025
 * Latest top-tier models from each provider + FREE models for dev
 *
 * @see https://openrouter.ai/models - Source of truth for model IDs
 */
export const ModelIdEnum = z.enum([
  // ========================================================================
  // PAID MODELS - For preview/prod (ordered by price, cheapest first)
  // ========================================================================

  // --- FREE TIER (≤$0.35/M) - 10 models ---
  'google/gemini-2.0-flash-001', // $0.10/M - 1M context, ultra-fast
  'openai/gpt-4o-mini', // $0.15/M - 128K context, budget
  'x-ai/grok-4-fast', // $0.20/M - 2M context, multimodal
  'x-ai/grok-4.1-fast', // $0.20/M - 2M context, agentic tool calling
  'x-ai/grok-code-fast-1', // $0.20/M - 256K context, agentic coding
  'deepseek/deepseek-chat-v3-0324', // $0.20/M - 164K context, fast chat
  'deepseek/deepseek-r1-0528', // $0.20/M - 164K context, latest R1
  'deepseek/deepseek-v3.2', // $0.27/M - 164K context, latest V3
  'deepseek/deepseek-r1', // $0.30/M - 164K context, reasoning
  'google/gemini-2.5-flash', // $0.30/M - 1M context, reasoning

  // --- STARTER TIER (≤$1.50/M) - adds 4 ---
  'mistralai/mistral-large-2512', // $0.50/M - 262K context, MoE
  'anthropic/claude-3.5-haiku', // $0.80/M - 200K context, fast
  'anthropic/claude-haiku-4.5', // $1/M - 200K context, latest Haiku
  'openai/o3-mini', // $1.10/M - 200K context, STEM reasoning

  // --- PRO TIER (≤$5.00/M) - adds 10 ---
  'google/gemini-2.5-pro', // $1.25/M - 1M context, flagship
  'openai/o3', // $2/M - 200K context, reasoning
  'openai/gpt-4.1', // $2/M - 1M context, flagship
  'google/gemini-3-pro-preview', // $2/M - 1M context, Gemini 3 flagship
  'openai/gpt-4o', // $2.50/M - 128K context, multimodal
  'x-ai/grok-3', // $3/M - 131K context, flagship
  'x-ai/grok-4', // $3/M - 256K context, latest reasoning
  'anthropic/claude-3.7-sonnet', // $3/M - 200K context, coding
  'anthropic/claude-sonnet-4', // $3/M - 1M context, flagship
  'anthropic/claude-sonnet-4.5', // $3/M - 1M context, latest Sonnet

  // --- POWER TIER (unlimited) - adds 4 ---
  'anthropic/claude-opus-4.5', // $5/M - 200K context, latest Opus
  'anthropic/claude-3.5-sonnet', // $6/M - 200K context, premium
  'openai/o1', // $15/M - 200K context, PhD-level reasoning
  'anthropic/claude-opus-4', // $15/M - 200K context, world's best coding

  // ========================================================================
  // FREE MODELS - For local dev only (costless, :free suffix)
  // ========================================================================
  'google/gemini-2.0-flash-exp:free', // 1M context - Google free
  'google/gemma-3-27b-it:free', // 131K context - Gemma free
  'meta-llama/llama-4-maverick:free', // 1M context - Llama 4 free
  'meta-llama/llama-3.3-70b-instruct:free', // 131K context - Llama 3.3 free
  'deepseek/deepseek-r1-0528:free', // 164K context - DeepSeek R1 free
  'deepseek/deepseek-chat-v3-0324:free', // 131K context - DeepSeek V3 free
  'mistralai/mistral-small-3.1-24b-instruct:free', // 128K context - Mistral free
  'qwen/qwen3-235b-a22b:free', // 131K context - Qwen3 MoE free
  'qwen/qwen-2.5-72b-instruct:free', // 131K context - Qwen 2.5 free
  'microsoft/phi-4:free', // 16K context - Phi-4 free
]);

export type ModelId = z.infer<typeof ModelIdEnum>;

// ============================================================================
// MODEL PROVIDER ENUM
// ============================================================================

export const ModelProviderEnum = z.enum([
  'x-ai',
  'anthropic',
  'google',
  'deepseek',
  'openai',
  // Free model providers (dev only)
  'meta-llama',
  'mistralai',
  'qwen',
  'microsoft',
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
// HARDCODED MODEL CATALOG - Verified from OpenRouter Dec 2025
// ============================================================================

/**
 * ✅ PAID MODELS: 20 models for preview/prod (ordered by price, cheapest first)
 *
 * Pricing tiers (input per 1M tokens):
 * - FREE TIER: ≤ $0.35/1M (8 models)
 * - STARTER: ≤ $1.50/1M (10 models)
 * - PRO: ≤ $3.50/1M (17 models)
 * - POWER: Unlimited (20 models)
 *
 * @see https://openrouter.ai/models - Source of truth
 */
export const HARDCODED_MODELS: readonly HardcodedModel[] = [
  // ========================================================================
  // FREE TIER (≤$0.35/M) - 8 models, ordered by price
  // ========================================================================
  {
    id: 'google/gemini-2.0-flash-001',
    name: 'Gemini 2.0 Flash',
    description: 'Ultra-fast, ultra-cheap. 1M context multimodal.',
    context_length: 1048576,
    created: 1738540800,
    pricing: { prompt: '0.00000010', completion: '0.00000040' },
    top_provider: { context_length: 1048576, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image+video+audio->text', tokenizer: 'Gemini', instruct_type: 'gemini' },
    provider: 'google',
    category: 'general',
    capabilities: { vision: true, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: '$0.10/1M', output: '$0.40/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Budget champion. 60% cheaper than GPT-3.5 Turbo.',
    context_length: 128000,
    created: 1715385600,
    pricing: { prompt: '0.00000015', completion: '0.00000060' },
    top_provider: { context_length: 128000, max_completion_tokens: 16384, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text+image->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
    category: 'general',
    capabilities: { vision: true, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: '$0.15/1M', output: '$0.60/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
  {
    id: 'x-ai/grok-4-fast',
    name: 'Grok 4 Fast',
    description: 'xAI multimodal with 2M context. Best cost-efficiency.',
    context_length: 2000000,
    created: 1735689600,
    pricing: { prompt: '0.00000020', completion: '0.00000050' },
    top_provider: { context_length: 2000000, max_completion_tokens: 30000, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image->text', tokenizer: 'Grok', instruct_type: 'grok' },
    provider: 'x-ai',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$0.20/1M', output: '$0.50/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'x-ai/grok-4.1-fast',
    name: 'Grok 4.1 Fast',
    description: 'xAI latest. 2M context, agentic tool calling.',
    context_length: 2000000,
    created: 1733097600,
    pricing: { prompt: '0.00000020', completion: '0.00000050' },
    top_provider: { context_length: 2000000, max_completion_tokens: 30000, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image->text', tokenizer: 'Grok', instruct_type: 'grok' },
    provider: 'x-ai',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$0.20/1M', output: '$0.50/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'x-ai/grok-code-fast-1',
    name: 'Grok Code Fast',
    description: 'xAI agentic coding model. Visible reasoning traces.',
    context_length: 256000,
    created: 1740441600,
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
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'deepseek/deepseek-chat-v3-0324',
    name: 'DeepSeek Chat V3',
    description: '685B MoE model. Fast, affordable, great for chat.',
    context_length: 163840,
    created: 1742860800,
    pricing: { prompt: '0.00000020', completion: '0.00000088' },
    top_provider: { context_length: 163840, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'DeepSeek', instruct_type: 'deepseek' },
    provider: 'deepseek',
    category: 'general',
    capabilities: { vision: false, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: '$0.20/1M', output: '$0.88/1M' },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
  {
    id: 'deepseek/deepseek-r1-0528',
    name: 'DeepSeek R1 0528',
    description: 'Latest R1. 671B params, open-source reasoning.',
    context_length: 163840,
    created: 1748390400,
    pricing: { prompt: '0.00000020', completion: '0.00000450' },
    top_provider: { context_length: 163840, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'DeepSeek', instruct_type: 'deepseek' },
    provider: 'deepseek',
    category: 'reasoning',
    capabilities: { vision: false, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$0.20/1M', output: '$4.50/1M' },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'deepseek/deepseek-v3.2',
    name: 'DeepSeek V3.2',
    description: 'Latest V3 with Sparse Attention. Long-context optimized.',
    context_length: 163840,
    created: 1733097600,
    pricing: { prompt: '0.00000027', completion: '0.00000040' },
    top_provider: { context_length: 163840, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'DeepSeek', instruct_type: 'deepseek' },
    provider: 'deepseek',
    category: 'general',
    capabilities: { vision: false, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$0.27/1M', output: '$0.40/1M' },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    description: 'Reasoning model. Performance on par with OpenAI o1.',
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
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: '1M context with thinking. Best for coding and math.',
    context_length: 1048576,
    created: 1740441600,
    pricing: { prompt: '0.00000030', completion: '0.00000250' },
    top_provider: { context_length: 1048576, max_completion_tokens: 65536, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image+video+audio->text', tokenizer: 'Gemini', instruct_type: 'gemini' },
    provider: 'google',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$0.30/1M', output: '$2.50/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },

  // ========================================================================
  // STARTER TIER (≤$1.50/M) - adds 4 models
  // ========================================================================
  {
    id: 'mistralai/mistral-large-2512',
    name: 'Mistral Large 3 2512',
    description: '675B MoE, 41B active. Apache 2.0 licensed.',
    context_length: 262144,
    created: 1733097600,
    pricing: { prompt: '0.00000050', completion: '0.00000150' },
    top_provider: { context_length: 262144, max_completion_tokens: 16384, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image->text', tokenizer: 'Mistral', instruct_type: 'mistral' },
    provider: 'mistralai',
    category: 'general',
    capabilities: { vision: true, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: '$0.50/1M', output: '$1.50/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
  {
    id: 'anthropic/claude-3.5-haiku',
    name: 'Claude 3.5 Haiku',
    description: 'Fast Claude. Quick responses for chat and code.',
    context_length: 200000,
    created: 1730937600,
    pricing: { prompt: '0.00000080', completion: '0.00000400' },
    top_provider: { context_length: 200000, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image->text', tokenizer: 'Claude', instruct_type: 'claude' },
    provider: 'anthropic',
    category: 'general',
    capabilities: { vision: true, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: '$0.80/1M', output: '$4/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Claude Haiku 4.5',
    description: 'Latest Haiku. 73% SWE-bench. Extended thinking.',
    context_length: 200000,
    created: 1733097600,
    pricing: { prompt: '0.00000100', completion: '0.00000500' },
    top_provider: { context_length: 200000, max_completion_tokens: 64000, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image->text', tokenizer: 'Claude', instruct_type: 'claude' },
    provider: 'anthropic',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$1/1M', output: '$5/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'openai/o3-mini',
    name: 'OpenAI o3-mini',
    description: 'Cost-efficient STEM reasoning. Adjustable reasoning effort.',
    context_length: 200000,
    created: 1748390400,
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
    supports_temperature: true,
    supports_reasoning_stream: true,
  },

  // ========================================================================
  // PRO TIER (≤$5.00/M) - adds 10 models, ordered by price
  // ========================================================================
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Google flagship. #1 on LMArena. Top reasoning.',
    context_length: 1048576,
    created: 1740441600,
    pricing: { prompt: '0.00000125', completion: '0.00001000' },
    top_provider: { context_length: 1048576, max_completion_tokens: 65536, is_moderated: false },
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
    id: 'openai/o3',
    name: 'OpenAI o3',
    description: 'Latest reasoning model. Math, science, coding, visual.',
    context_length: 200000,
    created: 1744761600,
    pricing: { prompt: '0.00000200', completion: '0.00000800' },
    top_provider: { context_length: 200000, max_completion_tokens: 100000, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
    category: 'reasoning',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$2/1M', output: '$8/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'openai/gpt-4.1',
    name: 'GPT-4.1',
    description: 'OpenAI flagship. 1M context, 54.6% SWE-bench.',
    context_length: 1047576,
    created: 1744675200,
    pricing: { prompt: '0.00000200', completion: '0.00000800' },
    top_provider: { context_length: 1047576, max_completion_tokens: 32768, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$2/1M', output: '$8/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'google/gemini-3-pro-preview',
    name: 'Gemini 3 Pro Preview',
    description: 'Google flagship frontier. 1M context, multimodal.',
    context_length: 1048576,
    created: 1733097600,
    pricing: { prompt: '0.00000200', completion: '0.00001200' },
    top_provider: { context_length: 1048576, max_completion_tokens: 65536, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image+video+audio+file->text', tokenizer: 'Gemini', instruct_type: 'gemini' },
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
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    description: 'Most popular ChatGPT model. 2x faster than GPT-4 Turbo.',
    context_length: 128000,
    created: 1715385600,
    pricing: { prompt: '0.00000250', completion: '0.00001000' },
    top_provider: { context_length: 128000, max_completion_tokens: 16384, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text+image->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
    category: 'general',
    capabilities: { vision: true, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: '$2.50/1M', output: '$10/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
  {
    id: 'x-ai/grok-3',
    name: 'Grok 3',
    description: 'xAI flagship. Deep domain knowledge in finance, healthcare, law.',
    context_length: 131072,
    created: 1736294400,
    pricing: { prompt: '0.00000300', completion: '0.00001500' },
    top_provider: { context_length: 131072, max_completion_tokens: 16384, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'Grok', instruct_type: 'grok' },
    provider: 'x-ai',
    category: 'general',
    capabilities: { vision: false, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$3/1M', output: '$15/1M' },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
  {
    id: 'x-ai/grok-4',
    name: 'Grok 4',
    description: 'xAI latest reasoning model. 256K context, parallel tools.',
    context_length: 256000,
    created: 1752019200,
    pricing: { prompt: '0.00000300', completion: '0.00001500' },
    top_provider: { context_length: 256000, max_completion_tokens: 32768, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image->text', tokenizer: 'Grok', instruct_type: 'grok' },
    provider: 'x-ai',
    category: 'reasoning',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$3/1M', output: '$15/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: false,
    supports_reasoning_stream: false,
  },
  {
    id: 'anthropic/claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet',
    description: 'Hybrid reasoning Claude. Best for coding and agentic tasks.',
    context_length: 200000,
    created: 1740441600,
    pricing: { prompt: '0.00000300', completion: '0.00001500' },
    top_provider: { context_length: 200000, max_completion_tokens: 16384, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'Claude', instruct_type: 'claude' },
    provider: 'anthropic',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$3/1M', output: '$15/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    description: 'Anthropic flagship. 1M context, best for coding and agents.',
    context_length: 1000000,
    created: 1747958400,
    pricing: { prompt: '0.00000300', completion: '0.00001500' },
    top_provider: { context_length: 1000000, max_completion_tokens: 16384, is_moderated: false },
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
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    description: 'Latest Sonnet. 1M context, agent-optimized.',
    context_length: 1000000,
    created: 1733097600,
    pricing: { prompt: '0.00000300', completion: '0.00001500' },
    top_provider: { context_length: 1000000, max_completion_tokens: 64000, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'Claude', instruct_type: 'claude' },
    provider: 'anthropic',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$3/1M', output: '$15/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },

  // ========================================================================
  // POWER TIER (unlimited) - adds 4 models
  // ========================================================================
  {
    id: 'anthropic/claude-opus-4.5',
    name: 'Claude Opus 4.5',
    description: 'Latest Opus. 80.9% SWE-bench. Advanced reasoning.',
    context_length: 200000,
    created: 1733097600,
    pricing: { prompt: '0.00000500', completion: '0.00002500' },
    top_provider: { context_length: 200000, max_completion_tokens: 64000, is_moderated: false },
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
    description: 'Premium Claude. Excellent coding and visual processing.',
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
  {
    id: 'openai/o1',
    name: 'OpenAI o1',
    description: 'PhD-level reasoning. Best for STEM, physics, chemistry, biology.',
    context_length: 200000,
    created: 1726099200,
    pricing: { prompt: '0.00001500', completion: '0.00006000' },
    top_provider: { context_length: 200000, max_completion_tokens: 100000, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
    category: 'reasoning',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$15/1M', output: '$60/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: false,
    supports_reasoning_stream: true,
  },
  {
    id: 'anthropic/claude-opus-4',
    name: 'Claude Opus 4',
    description: 'World\'s best coding model. 72.5% SWE-bench, 43.2% Terminal-bench.',
    context_length: 200000,
    created: 1747958400,
    pricing: { prompt: '0.00001500', completion: '0.00007500' },
    top_provider: { context_length: 200000, max_completion_tokens: 32768, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'Claude', instruct_type: 'claude' },
    provider: 'anthropic',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$15/1M', output: '$75/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
] as const;

// ============================================================================
// DEV-ONLY FREE MODELS - Costless models for local development
// ============================================================================

/**
 * ✅ FREE MODELS: Costless models for local dev only (:free suffix)
 *
 * These models are FREE on OpenRouter (no cost) but have rate limits.
 * Only shown in local dev mode to save costs during development.
 * In preview/prod, free tier users see paid cheap models instead.
 *
 * @see https://openrouter.ai/models?pricing=free
 */
export const DEV_FREE_MODELS: readonly HardcodedModel[] = [
  // ========================================================================
  // GOOGLE FREE (2)
  // ========================================================================
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash Exp (Free)',
    description: 'Free Gemini 2.0 Flash. 1M context, multimodal.',
    context_length: 1048576,
    created: 1738540800,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 1048576, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image+video+audio->text', tokenizer: 'Gemini', instruct_type: 'gemini' },
    provider: 'google',
    category: 'general',
    capabilities: { vision: true, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: 'Free', output: 'Free' },
    is_free: true,
    supports_vision: true,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
  {
    id: 'google/gemma-3-27b-it:free',
    name: 'Gemma 3 27B (Free)',
    description: 'Free Google Gemma 3. 131K context.',
    context_length: 131072,
    created: 1740441600,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 131072, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'Gemma', instruct_type: 'gemma' },
    provider: 'google',
    category: 'general',
    capabilities: { vision: false, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: 'Free', output: 'Free' },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },

  // ========================================================================
  // META FREE (2)
  // ========================================================================
  {
    id: 'meta-llama/llama-4-maverick:free',
    name: 'Llama 4 Maverick (Free)',
    description: 'Free Llama 4 MoE. 1M context, multimodal.',
    context_length: 1048576,
    created: 1743811200,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 1048576, max_completion_tokens: 16384, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image->text', tokenizer: 'Llama', instruct_type: 'llama' },
    provider: 'meta-llama',
    category: 'general',
    capabilities: { vision: true, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: 'Free', output: 'Free' },
    is_free: true,
    supports_vision: true,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B (Free)',
    description: 'Free Llama 3.3 70B. 131K context, multilingual.',
    context_length: 131072,
    created: 1733443200,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 131072, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'Llama', instruct_type: 'llama' },
    provider: 'meta-llama',
    category: 'general',
    capabilities: { vision: false, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: 'Free', output: 'Free' },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },

  // ========================================================================
  // DEEPSEEK FREE (2)
  // ========================================================================
  {
    id: 'deepseek/deepseek-r1-0528:free',
    name: 'DeepSeek R1 0528 (Free)',
    description: 'Free DeepSeek R1. 164K context, reasoning.',
    context_length: 163840,
    created: 1748390400,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 163840, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'DeepSeek', instruct_type: 'deepseek' },
    provider: 'deepseek',
    category: 'reasoning',
    capabilities: { vision: false, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: 'Free', output: 'Free' },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'deepseek/deepseek-chat-v3-0324:free',
    name: 'DeepSeek V3 (Free)',
    description: 'Free DeepSeek V3. 131K context, fast chat.',
    context_length: 131072,
    created: 1742860800,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 131072, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'DeepSeek', instruct_type: 'deepseek' },
    provider: 'deepseek',
    category: 'general',
    capabilities: { vision: false, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: 'Free', output: 'Free' },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },

  // ========================================================================
  // MISTRAL FREE (1)
  // ========================================================================
  {
    id: 'mistralai/mistral-small-3.1-24b-instruct:free',
    name: 'Mistral Small 3.1 (Free)',
    description: 'Free Mistral Small 3.1. 128K context.',
    context_length: 128000,
    created: 1740441600,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 128000, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'Mistral', instruct_type: 'mistral' },
    provider: 'mistralai',
    category: 'general',
    capabilities: { vision: false, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: 'Free', output: 'Free' },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },

  // ========================================================================
  // QWEN FREE (2)
  // ========================================================================
  {
    id: 'qwen/qwen3-235b-a22b:free',
    name: 'Qwen3 235B MoE (Free)',
    description: 'Free Qwen3 235B MoE. 131K context, 22B active.',
    context_length: 131072,
    created: 1745971200,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 131072, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'Qwen', instruct_type: 'qwen' },
    provider: 'qwen',
    category: 'general',
    capabilities: { vision: false, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: 'Free', output: 'Free' },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct:free',
    name: 'Qwen 2.5 72B (Free)',
    description: 'Free Qwen 2.5 72B. 131K context, multilingual.',
    context_length: 131072,
    created: 1726704000,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 131072, max_completion_tokens: 8192, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'Qwen', instruct_type: 'qwen' },
    provider: 'qwen',
    category: 'general',
    capabilities: { vision: false, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: 'Free', output: 'Free' },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },

  // ========================================================================
  // MICROSOFT FREE (1)
  // ========================================================================
  {
    id: 'microsoft/phi-4:free',
    name: 'Phi-4 (Free)',
    description: 'Free Microsoft Phi-4. 16K context, reasoning.',
    context_length: 16384,
    created: 1734220800,
    pricing: { prompt: '0', completion: '0' },
    top_provider: { context_length: 16384, max_completion_tokens: 4096, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'Phi', instruct_type: 'phi' },
    provider: 'microsoft',
    category: 'general',
    capabilities: { vision: false, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: 'Free', output: 'Free' },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
] as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if running in local dev mode
 */
function isDevMode(): boolean {
  return process.env.NEXT_PUBLIC_WEBAPP_ENV === 'local';
}

/**
 * Get all models based on environment
 *
 * - Local dev: Returns DEV_FREE_MODELS + HARDCODED_MODELS (free first, then paid)
 * - Preview/prod: Returns HARDCODED_MODELS only (paid, ordered by price)
 */
export function getAllModels(): readonly HardcodedModel[] {
  if (isDevMode()) {
    // Dev mode: Free models first (costless), then paid models
    return [...DEV_FREE_MODELS, ...HARDCODED_MODELS];
  }
  return HARDCODED_MODELS;
}

/**
 * Get paid models only (for preview/prod)
 */
export function getPaidModels(): readonly HardcodedModel[] {
  return HARDCODED_MODELS;
}

/**
 * Get free models only (for local dev)
 */
export function getDevFreeModels(): readonly HardcodedModel[] {
  return DEV_FREE_MODELS;
}

export function getModelById(modelId: string): HardcodedModel | undefined {
  // Check paid models first, then dev free models
  return HARDCODED_MODELS.find(model => model.id === modelId)
    || DEV_FREE_MODELS.find(model => model.id === modelId);
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
 * Get the cheapest model for system operations (title generation, etc.)
 */
export function getBestFreeModelForDev(): HardcodedModel {
  const cheapModels = HARDCODED_MODELS
    .filter(m => !m.is_reasoning_model)
    .sort((a, b) => Number.parseFloat(a.pricing.prompt) - Number.parseFloat(b.pricing.prompt));
  return cheapModels[0] || HARDCODED_MODELS[0]!;
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
