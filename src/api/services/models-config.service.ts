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

import type { StreamingBehavior } from '@/api/core/enums';
import {
  ModelCategorySchema,
  PROVIDER_STREAMING_DEFAULTS,
  StreamingBehaviors,
  StreamingBehaviorSchema,
} from '@/api/core/enums';

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

  // --- FREE TIER (≤$0.35/M) - 14 models ---
  'openai/gpt-oss-120b', // $0.039/M - 131K context, open MoE, ultra-cheap
  'openai/gpt-5-nano', // $0.05/M - 400K context, ultra-cheap
  'google/gemini-2.0-flash-001', // $0.10/M - 1M context, ultra-fast
  'openai/gpt-4.1-nano', // $0.10/M - 1M context, fastest GPT-4.1
  'openai/gpt-4o-mini', // $0.15/M - 128K context, budget
  'x-ai/grok-4-fast', // $0.20/M - 2M context, multimodal
  'x-ai/grok-4.1-fast', // $0.20/M - 2M context, agentic tool calling
  'x-ai/grok-code-fast-1', // $0.20/M - 256K context, agentic coding
  'deepseek/deepseek-chat-v3-0324', // $0.20/M - 164K context, fast chat
  'deepseek/deepseek-r1-0528', // $0.20/M - 164K context, latest R1
  'deepseek/deepseek-v3.2', // $0.27/M - 164K context, latest V3
  'google/gemini-2.5-flash', // $0.30/M - 1M context, reasoning

  // --- STARTER TIER (≤$1.50/M) - adds 8 ---
  'openai/gpt-5-mini', // $0.25/M - 400K context, compact GPT-5
  'openai/gpt-4.1-mini', // $0.40/M - 1M context, mid-tier GPT-4.1
  'mistralai/mistral-large-2512', // $0.50/M - 262K context, MoE
  'google/gemini-3-flash-preview', // $0.50/M - 1M context, fast thinking
  'anthropic/claude-haiku-4.5', // $1/M - 200K context, latest Haiku
  'openai/o3-mini', // $1.10/M - 200K context, STEM reasoning
  'openai/o4-mini', // $1.10/M - 200K context, compact reasoning

  // --- PRO TIER (≤$5.00/M) - adds 10 ---
  'google/gemini-2.5-pro', // $1.25/M - 1M context, flagship
  'openai/gpt-5', // $1.25/M - 400K context, frontier reasoning
  'openai/gpt-5.1', // $1.25/M - 400K context, adaptive reasoning
  'openai/gpt-5.2', // $1.75/M - 400K context, latest frontier
  'openai/o3', // $2/M - 200K context, reasoning
  'openai/gpt-4.1', // $2/M - 1M context, flagship
  'google/gemini-3-pro-preview', // $2/M - 1M context, Gemini 3 flagship
  'x-ai/grok-3', // $3/M - 131K context, flagship
  'x-ai/grok-4', // $3/M - 256K context, latest reasoning
  'anthropic/claude-sonnet-4', // $3/M - 1M context, flagship
  'anthropic/claude-sonnet-4.5', // $3/M - 1M context, latest Sonnet

  // --- POWER TIER (unlimited) - adds 3 ---
  'anthropic/claude-opus-4.5', // $5/M - 200K context, latest Opus
  'openai/o1', // $15/M - 200K context, PhD-level reasoning
  'anthropic/claude-opus-4', // $15/M - 200K context, world's best coding

  // ========================================================================
  // FREE MODELS - DISABLED
  // ⚠️ Dec 2025: Free models on OpenRouter are unreliable:
  // - "No endpoints found" errors even for listed models
  // - Most don't support tool/function calling
  // - Require specific privacy settings to work
  // Use cheap paid models (gemini-2.0-flash, gpt-4o-mini) for dev instead
  // ========================================================================
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
  'mistralai',
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
  /**
   * ✅ STREAMING BEHAVIOR: How the model delivers SSE chunks (optional - inferred from provider)
   * - 'token': Streams token-by-token (OpenAI, Anthropic, Mistral) - no normalization needed
   * - 'buffered': Buffers server-side (xAI, DeepSeek, Gemini) - needs smoothStream normalization
   *
   * If not specified, getModelStreamingBehavior() infers from provider.
   */
  streaming_behavior: StreamingBehaviorSchema.optional(),
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
  // FREE TIER (≤$0.35/M) - 12 models, ordered by price
  // ========================================================================
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    description: 'Open-weight 117B MoE. Ultra-cheap, high-reasoning.',
    context_length: 131072,
    created: 1733097600,
    pricing: { prompt: '0.000000039', completion: '0.00000019' },
    top_provider: { context_length: 131072, max_completion_tokens: 16384, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
    category: 'general',
    capabilities: { vision: false, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$0.039/1M', output: '$0.19/1M' },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'openai/gpt-5-nano',
    name: 'GPT-5 Nano',
    description: 'Smallest, fastest GPT-5 variant. Ultra-low latency.',
    context_length: 400000,
    created: 1723075200,
    pricing: { prompt: '0.00000005', completion: '0.00000040' },
    top_provider: { context_length: 400000, max_completion_tokens: 32768, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
    category: 'general',
    // ✅ GPT-5 NANO HAS MANDATORY REASONING: Model uses encrypted reasoning tokens internally
    // Reference: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
    // Without reasoning config, model exhausts tokens on hidden reasoning before generating text
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$0.05/1M', output: '$0.40/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
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
    id: 'openai/gpt-4.1-nano',
    name: 'GPT-4.1 Nano',
    description: 'Fastest, cheapest GPT-4.1. Classification & autocompletion.',
    context_length: 1047576,
    created: 1713052800,
    pricing: { prompt: '0.00000010', completion: '0.00000040' },
    top_provider: { context_length: 1047576, max_completion_tokens: 32768, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
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
  // STARTER TIER (≤$1.50/M) - adds 8 models
  // ========================================================================
  {
    id: 'openai/gpt-5-mini',
    name: 'GPT-5 Mini',
    description: 'Compact GPT-5. Lighter reasoning, lower latency.',
    context_length: 400000,
    created: 1723075200,
    pricing: { prompt: '0.00000025', completion: '0.00000200' },
    top_provider: { context_length: 400000, max_completion_tokens: 32768, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$0.25/1M', output: '$2/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },
  {
    id: 'openai/gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    description: 'Mid-tier GPT-4.1. Competitive with GPT-4o at lower cost.',
    context_length: 1047576,
    created: 1713052800,
    pricing: { prompt: '0.00000040', completion: '0.00000160' },
    top_provider: { context_length: 1047576, max_completion_tokens: 32768, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
    category: 'general',
    capabilities: { vision: true, reasoning: false, streaming: true, tools: true },
    pricing_display: { input: '$0.40/1M', output: '$1.60/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
    supports_temperature: true,
    supports_reasoning_stream: false,
  },
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
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash Preview',
    description: 'High-speed thinking model. Configurable reasoning levels.',
    context_length: 1048576,
    created: 1734393600,
    pricing: { prompt: '0.00000050', completion: '0.00000300' },
    top_provider: { context_length: 1048576, max_completion_tokens: 65536, is_moderated: false },
    per_request_limits: null,
    architecture: { modality: 'text+image+video+audio+file->text', tokenizer: 'Gemini', instruct_type: 'gemini' },
    provider: 'google',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$0.50/1M', output: '$3/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
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
  {
    id: 'openai/o4-mini',
    name: 'OpenAI o4-mini',
    description: 'Compact o-series reasoning. Fast multimodal with vision.',
    context_length: 200000,
    created: 1748390400,
    pricing: { prompt: '0.00000110', completion: '0.00000440' },
    top_provider: { context_length: 200000, max_completion_tokens: 100000, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
    category: 'reasoning',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$1.10/1M', output: '$4.40/1M' },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
    supports_temperature: true,
    supports_reasoning_stream: true,
  },

  // ========================================================================
  // PRO TIER (≤$5.00/M) - adds 11 models, ordered by price
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
    id: 'openai/gpt-5',
    name: 'GPT-5',
    description: 'OpenAI frontier model. Major improvements in reasoning.',
    context_length: 400000,
    created: 1723075200,
    pricing: { prompt: '0.00000125', completion: '0.00001000' },
    top_provider: { context_length: 400000, max_completion_tokens: 128000, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
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
    id: 'openai/gpt-5.1',
    name: 'GPT-5.1',
    description: 'GPT-5 with adaptive reasoning. Natural conversational style.',
    context_length: 400000,
    created: 1748390400,
    pricing: { prompt: '0.00000125', completion: '0.00001000' },
    top_provider: { context_length: 400000, max_completion_tokens: 128000, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
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
    id: 'openai/gpt-5.2',
    name: 'GPT-5.2',
    description: 'Latest GPT-5. Enhanced agentic and long-context performance.',
    context_length: 400000,
    created: 1733788800,
    pricing: { prompt: '0.00000175', completion: '0.00001400' },
    top_provider: { context_length: 400000, max_completion_tokens: 128000, is_moderated: true },
    per_request_limits: null,
    architecture: { modality: 'text+image+file->text', tokenizer: 'o200k_base', instruct_type: 'chatml' },
    provider: 'openai',
    category: 'general',
    capabilities: { vision: true, reasoning: true, streaming: true, tools: true },
    pricing_display: { input: '$1.75/1M', output: '$14/1M' },
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
// USER-FACING MODELS - Curated list for UI selection (Dec 2025)
// ============================================================================

/**
 * ✅ USER-FACING MODELS: Best 6 multimodal models for perfect results
 *
 * Criteria:
 * - Multimodal support (vision + text)
 * - Top-tier quality and reliability
 * - Diverse price points for accessibility
 *
 * @see User request: "best models supporting multimodals now"
 */
export const USER_FACING_MODEL_IDS: readonly ModelId[] = [
  'google/gemini-2.5-flash', // $0.30/M - Fast, affordable multimodal
  'google/gemini-2.5-pro', // $1.25/M - #1 on LMArena, flagship
  'openai/gpt-5.1', // $1.25/M - OpenAI latest flagship, multimodal
  'google/gemini-3-pro-preview', // $2/M - Gemini 3 flagship (preview, may have MCP issues)
  'anthropic/claude-sonnet-4.5', // $3/M - Agent-optimized, 1M context
  'anthropic/claude-opus-4.5', // $5/M - 80.9% SWE-bench, best reasoning
] as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all available models (for internal/system use)
 * Same models available in all environments (local, preview, production)
 */
export function getAllModels(): readonly HardcodedModel[] {
  return HARDCODED_MODELS;
}

/**
 * Get user-facing models for UI selection
 * Returns curated list of 6 best multimodal models
 */
export function getUserFacingModels(): readonly HardcodedModel[] {
  return HARDCODED_MODELS.filter(model =>
    USER_FACING_MODEL_IDS.includes(model.id),
  );
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

/**
 * Get the cheapest model for system operations (title generation, etc.)
 * Returns Gemini 2.0 Flash ($0.10/M) - cheapest non-reasoning model
 */
export function getCheapestModel(): HardcodedModel {
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

/**
 * ✅ GET STREAMING BEHAVIOR: Determines if model needs smoothStream normalization
 *
 * Returns the streaming behavior for a model:
 * - 'token': Streams token-by-token (OpenAI, Anthropic, Mistral) - no normalization needed
 * - 'buffered': Buffers server-side (xAI, DeepSeek, Gemini) - needs smoothStream normalization
 *
 * Priority:
 * 1. Model's explicit streaming_behavior (if set)
 * 2. Provider default from PROVIDER_STREAMING_DEFAULTS
 * 3. Fallback to 'token' (safe default - no normalization)
 *
 * @param modelId - The full model ID (e.g., 'x-ai/grok-4-fast', 'openai/gpt-5')
 * @returns StreamingBehavior - 'token' or 'buffered'
 */
export function getModelStreamingBehavior(modelId: string): StreamingBehavior {
  // Check for explicit model-level override
  const model = getModelById(modelId);
  if (model?.streaming_behavior) {
    return model.streaming_behavior;
  }

  // Extract provider from model ID (format: "provider/model-name")
  const provider = modelId.split('/')[0] || '';

  // Return provider default or fallback to 'token'
  return PROVIDER_STREAMING_DEFAULTS[provider] ?? StreamingBehaviors.TOKEN;
}

/**
 * ✅ NEEDS SMOOTH STREAM: Quick check if model needs chunk normalization
 *
 * Returns true if the model buffers responses server-side and needs
 * smoothStream to normalize chunk delivery for consistent UI rendering.
 *
 * @param modelId - The full model ID (e.g., 'x-ai/grok-4-fast')
 * @returns boolean - true if model needs smoothStream normalization
 */
export function needsSmoothStream(modelId: string): boolean {
  return getModelStreamingBehavior(modelId) === StreamingBehaviors.BUFFERED;
}
