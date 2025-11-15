/**
 * Models Configuration Service - SINGLE SOURCE OF TRUTH
 *
 * ✅ THE ONLY PLACE for all model definitions and configuration:
 * - Model IDs, names, descriptions, pricing, capabilities
 * - Provider information and categorization
 * - Context lengths, tokens, and technical specifications
 * - Zod-based enums for strict type safety
 *
 * ✅ ZOD-FIRST ARCHITECTURE:
 * - All types inferred from Zod schemas (NO manual interfaces/types)
 * - Strict enum validation prevents invalid model IDs
 * - Runtime validation with compile-time type safety
 * - Single source exports used across entire codebase
 *
 * ✅ TOP 20 MODELS (October 2025):
 * Curated from authoritative sources:
 * - Chatbot Arena / LMArena leaderboards (performance rankings)
 * - OpenRouter usage statistics (real-world adoption)
 * - Industry benchmarks (SWE-bench, MMLU, HumanEval)
 * - Expert reviews and community feedback
 *
 * ⚠️ DO NOT:
 * - Create duplicate model lists elsewhere
 * - Make dynamic API calls to fetch models
 * - Define model types/interfaces outside this file
 * - Hardcode model IDs in handlers/components
 *
 * @see /docs/backend-patterns.md - Service layer patterns
 * @see /src/api/routes/models/schema.ts - API response schemas
 */

import { z } from '@hono/zod-openapi';

import { ModelCategorySchema } from '@/api/core/enums';

// ============================================================================
// ZOD-BASED MODEL ENUMS - Single Source of Truth
// ============================================================================

/**
 * ✅ MODEL ID ENUM: All allowed model IDs as Zod enum
 * This is the single source of truth for what models are allowed in the app
 */
export const ModelIdEnum = z.enum([
  // Google Models - ACTUAL OpenRouter IDs (verified from openrouter.ai/google)
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.0-flash-001',

  // OpenAI Models - ACTUAL OpenRouter IDs (verified from openrouter.ai/openai)
  'openai/gpt-5',
  'openai/gpt-5.1',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
  'openai/gpt-4o',
  'openai/o1',
  'openai/o3-mini',
  'openai/o3-mini-high',
  'openai/o4-mini',
  'openai/o4-mini-high',
  'openai/gpt-4-turbo',

  // Anthropic Models - ACTUAL OpenRouter IDs (verified from openrouter.ai/anthropic)
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-haiku-4.5',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-opus-4',
  'anthropic/claude-opus-4.1',
  'anthropic/claude-3.7-sonnet',
  'anthropic/claude-3.7-sonnet:thinking',
  'anthropic/claude-3.5-sonnet',

  // xAI Models - ACTUAL OpenRouter IDs (verified from openrouter.ai/x-ai)
  'x-ai/grok-4',
  'x-ai/grok-4-fast',
  'x-ai/grok-3',
  'x-ai/grok-3-mini',
  'x-ai/grok-code-fast-1',

  // DeepSeek Models - ACTUAL OpenRouter IDs (verified from openrouter.ai/deepseek)
  'deepseek/deepseek-chat-v3.1',
  'deepseek/deepseek-chat-v3.1:free',
  'deepseek/deepseek-v3.1-terminus',
  'deepseek/deepseek-v3.2-exp',
  'deepseek/deepseek-r1',
  'deepseek/deepseek-r1:free',
  'deepseek/deepseek-chat-v3-0324',
  'deepseek/deepseek-chat-v3-0324:free',

  // Qwen/Alibaba Models - ACTUAL OpenRouter IDs (verified from openrouter.ai/qwen)
  'qwen/qwen3-max',
  'qwen/qwen3-coder-plus',
  'qwen/qwen3-32b',

  // Meta Models - ACTUAL OpenRouter IDs (verified from openrouter.ai/meta-llama)
  'meta-llama/llama-4-scout',
  'meta-llama/llama-4-scout:free',
  'meta-llama/llama-4-maverick',
  'meta-llama/llama-4-maverick:free',
  'meta-llama/llama-3.3-70b-instruct:free',

  // MoonshotAI Models - ACTUAL OpenRouter IDs (verified from API)
  'moonshotai/kimi-k2-0905',
]);

export type ModelId = z.infer<typeof ModelIdEnum>;

/**
 * ✅ PROVIDER ENUM: All AI providers
 */
export const ModelProviderEnum = z.enum([
  'google',
  'openai',
  'anthropic',
  'x-ai',
  'deepseek',
  'qwen',
  'meta-llama',
  'moonshotai',
]);

export type ModelProvider = z.infer<typeof ModelProviderEnum>;

// ============================================================================
// HARDCODED MODEL SCHEMA
// ============================================================================

/**
 * Schema for hardcoded model definitions
 * Matches BaseModelResponse from routes/models/schema.ts
 */
export const HardcodedModelSchema = z.object({
  // Core OpenRouter fields
  id: ModelIdEnum,
  name: z.string(),
  description: z.string().optional(),
  context_length: z.number(),
  created: z.number().optional(),
  pricing: z.object({
    prompt: z.string(), // Price per token as string
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

  // Computed enhancement fields
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
});

export type HardcodedModel = z.infer<typeof HardcodedModelSchema>;

// ============================================================================
// COMPREHENSIVE MODEL CATALOG (November 2025)
// ============================================================================

/**
 * ✅ SINGLE SOURCE OF TRUTH: Complete AI model catalog (50+ models)
 *
 * Selected based on:
 * - OpenRouter availability and verified model IDs
 * - Chatbot Arena / LMArena rankings (Nov 2025)
 * - OpenRouter usage statistics
 * - Performance benchmarks and industry reviews
 * - Text-only models (excludes image generation like Nano Banana/Imagen)
 *
 * Models organized by provider and capability:
 * - Flagship models (best overall performance)
 * - Premium models (excellent performance)
 * - Specialized models (coding, reasoning, fast inference)
 * - Free tier models (cost-effective options)
 */
export const HARDCODED_MODELS: readonly HardcodedModel[] = [
  // ========== GOOGLE MODELS ==========

  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description:
      '#1 on Chatbot Arena. Google\'s most advanced multimodal model with 2M token context and exceptional reasoning capabilities.',
    context_length: 2000000,
    created: 1709251200, // March 2025
    pricing: {
      prompt: '0.00000125', // $1.25 per 1M tokens
      completion: '0.00001000', // $10.00 per 1M tokens
    },
    top_provider: {
      context_length: 2000000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image->text',
      tokenizer: 'Gemini',
      instruct_type: 'gemini',
    },
    provider: 'google',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$1.25/1M tokens',
      output: '$10/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'openai/gpt-5',
    name: 'GPT-5',
    description:
      'OpenAI\'s most advanced model with exceptional reasoning, problem-solving, and code generation. Industry benchmark for complex tasks.',
    context_length: 256000,
    created: 1723046400, // August 2025
    pricing: {
      prompt: '0.00000125', // $1.25 per 1M tokens
      completion: '0.00001000', // $10.00 per 1M tokens
    },
    top_provider: {
      context_length: 256000,
      max_completion_tokens: 16384,
      is_moderated: true,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image->text',
      tokenizer: 'o200k_base',
      instruct_type: 'chatml',
    },
    provider: 'openai',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$1.25/1M tokens',
      output: '$10/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'x-ai/grok-4',
    name: 'Grok 4',
    description:
      'xAI\'s latest model emphasizing truth-seeking AI with powerful reasoning. Trained on 200,000+ NVIDIA H100 GPUs for exceptional performance.',
    context_length: 2000000,
    created: 1706832000, // Feb 2025
    pricing: {
      prompt: '0.00000250', // $2.50 per 1M tokens
      completion: '0.00001000', // $10 per 1M tokens
    },
    top_provider: {
      context_length: 2000000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image->text',
      tokenizer: 'Grok',
      instruct_type: 'grok',
    },
    provider: 'x-ai',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$2.50/1M tokens',
      output: '$10/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  // ========== PREMIUM MODELS (Rank 6-12) ==========

  {
    id: 'anthropic/claude-opus-4',
    name: 'Claude 4 Opus',
    description:
      'Anthropic\'s most powerful Claude 4 model. Exceptional for complex reasoning, creative tasks, and detailed analysis.',
    context_length: 200000,
    created: 1709251200, // March 2024
    pricing: {
      prompt: '0.00001500', // $15 per 1M tokens
      completion: '0.00007500', // $75 per 1M tokens
    },
    top_provider: {
      context_length: 200000,
      max_completion_tokens: 4096,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image->text',
      tokenizer: 'Claude',
      instruct_type: 'claude',
    },
    provider: 'anthropic',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$15/1M tokens',
      output: '$75/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    description:
      'OpenAI\'s most popular chatbot model with 60.4% market share. Balanced performance for general-purpose tasks with vision capabilities.',
    context_length: 128000,
    created: 1715385600, // May 2024
    pricing: {
      prompt: '0.00000250', // $2.50 per 1M tokens
      completion: '0.00001000', // $10.00 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 16384,
      is_moderated: true,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image->text',
      tokenizer: 'o200k_base',
      instruct_type: 'chatml',
    },
    provider: 'openai',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$2.50/1M tokens',
      output: '$10/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'openai/o3-mini',
    name: 'o3 Mini',
    description:
      'OpenAI\'s reasoning model with adjustable reasoning effort. Matches o1 performance on challenging evaluations with lower latency and cost.',
    context_length: 128000,
    created: 1738281600, // Jan 2025
    pricing: {
      prompt: '0.00000110', // $1.10 per 1M tokens
      completion: '0.00000440', // $4.40 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 100000,
      is_moderated: true,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'o200k_base',
      instruct_type: 'chatml',
    },
    provider: 'openai',
    category: 'reasoning',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$1.10/1M tokens',
      output: '$4.40/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: true,
  },

  {
    id: 'qwen/qwen3-max',
    name: 'Qwen3 Max',
    description:
      'Alibaba\'s flagship trillion-parameter class model with strong coding and agentic capabilities. Competitive with leading Western models.',
    context_length: 128000,
    created: 1709251200, // March 2025
    pricing: {
      prompt: '0.00000120', // $1.20 per 1M tokens
      completion: '0.00000600', // $6.00 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'Qwen',
      instruct_type: 'chatml',
    },
    provider: 'qwen',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$1.20/1M tokens',
      output: '$6.00/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
  },

  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description:
      'Fast, efficient Gemini model with 2M token context. Excellent balance of speed and capability for high-throughput tasks.',
    context_length: 2000000,
    created: 1709251200, // March 2025
    pricing: {
      prompt: '0.00000030', // $0.30 per 1M tokens
      completion: '0.00000250', // $2.50 per 1M tokens
    },
    top_provider: {
      context_length: 2000000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image->text',
      tokenizer: 'Gemini',
      instruct_type: 'gemini',
    },
    provider: 'google',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.30/1M tokens',
      output: '$2.50/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'google/gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    description:
      'Lightweight Gemini model with 1M token context. Optimized for ultra-low latency with optional reasoning mode via API parameter.',
    context_length: 1048576,
    created: 1709251200, // March 2025
    pricing: {
      prompt: '0.00000010', // $0.10 per 1M tokens
      completion: '0.00000040', // $0.40 per 1M tokens
    },
    top_provider: {
      context_length: 1048576,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image+file+audio+video->text',
      tokenizer: 'Gemini',
      instruct_type: 'gemini',
    },
    provider: 'google',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.10/1M tokens',
      output: '$0.40/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  // ========== ANTHROPIC MODELS ==========

  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude 4 Sonnet',
    description:
      'Anthropic\'s Claude 4 balanced model. Strong performance across reasoning, coding, and creative tasks with excellent reliability.',
    context_length: 200000,
    created: 1716336000, // May 2025
    pricing: {
      prompt: '0.00000300', // $3 per 1M tokens
      completion: '0.00001500', // $15 per 1M tokens
    },
    top_provider: {
      context_length: 200000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image->text',
      tokenizer: 'Claude',
      instruct_type: 'claude',
    },
    provider: 'anthropic',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$3/1M tokens',
      output: '$15/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'deepseek/deepseek-chat-v3-0324',
    name: 'DeepSeek V3 (March 2024)',
    description:
      'DeepSeek V3 March 2024 release with improved reasoning and coding. Cost-effective performance comparable to leading models.',
    context_length: 64000,
    created: 1709251200, // March 2025
    pricing: {
      prompt: '0.00000014', // $0.14 per 1M tokens
      completion: '0.00000028', // $0.28 per 1M tokens
    },
    top_provider: {
      context_length: 64000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'DeepSeek',
      instruct_type: 'chatml',
    },
    provider: 'deepseek',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.14/1M tokens',
      output: '$0.28/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
  },

  {
    id: 'deepseek/deepseek-chat-v3-0324:free',
    name: 'DeepSeek V3 (Free)',
    description:
      'Free tier DeepSeek V3 with excellent coding capabilities. Rate-limited but perfect for development and testing.',
    context_length: 64000,
    created: 1709251200, // March 2025
    pricing: {
      prompt: '0', // Free
      completion: '0', // Free
    },
    top_provider: {
      context_length: 64000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'DeepSeek',
      instruct_type: 'chatml',
    },
    provider: 'deepseek',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: 'Free',
      output: 'Free',
    },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: false,
  },

  {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek R1 (Free)',
    description:
      'Free tier DeepSeek R1 reasoning model with advanced problem-solving capabilities. Excellent for complex reasoning tasks.',
    context_length: 64000,
    created: 1736640000, // Jan 2025
    pricing: {
      prompt: '0', // Free
      completion: '0', // Free
    },
    top_provider: {
      context_length: 64000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'DeepSeek',
      instruct_type: 'chatml',
    },
    provider: 'deepseek',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: 'Free',
      output: 'Free',
    },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: true,
  },

  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B (Free)',
    description:
      'Free tier Meta Llama 3.3 70B instruction-tuned model. High-quality open-source model with strong general capabilities.',
    context_length: 128000,
    created: 1733097600, // Dec 2024
    pricing: {
      prompt: '0', // Free
      completion: '0', // Free
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'Llama',
      instruct_type: 'llama3',
    },
    provider: 'meta-llama',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: 'Free',
      output: 'Free',
    },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: false,
  },

  // ========== SPECIALIZED MODELS (Rank 13-20) ==========

  {
    id: 'x-ai/grok-code-fast-1',
    name: 'Grok Code Fast',
    description:
      'xAI\'s specialized coding model optimized for speed. Top performer for rapid code generation and developer workflows.',
    context_length: 128000,
    created: 1720051200, // July 2024
    pricing: {
      prompt: '0.00000020', // $0.20 per 1M tokens
      completion: '0.00000150', // $1.50 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'Grok',
      instruct_type: 'grok',
    },
    provider: 'x-ai',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.20/1M tokens',
      output: '$1.50/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
  },

  {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description:
      'OpenAI\'s optimized GPT-4 model with improved speed and efficiency. Reliable performance for general-purpose tasks.',
    context_length: 128000,
    created: 1699228800, // Nov 2023
    pricing: {
      prompt: '0.00001000', // $10 per 1M tokens
      completion: '0.00003000', // $30 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 4096,
      is_moderated: true,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image->text',
      tokenizer: 'cl100k_base',
      instruct_type: 'chatml',
    },
    provider: 'openai',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$10/1M tokens',
      output: '$30/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'qwen/qwen3-coder-plus',
    name: 'Qwen3 Coder Plus',
    description:
      '480B MoE model optimized for code generation. Excellent for agentic coding tasks, function calling, and repository reasoning.',
    context_length: 128000,
    created: 1730419200, // Nov 2024
    pricing: {
      prompt: '0.00000022', // $0.22 per 1M tokens
      completion: '0.00000095', // $0.95 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'Qwen',
      instruct_type: 'chatml',
    },
    provider: 'qwen',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.22/1M tokens',
      output: '$0.95/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
  },

  {
    id: 'x-ai/grok-4-fast',
    name: 'Grok 4 Fast',
    description:
      'xAI\'s latest multimodal model with SOTA cost-efficiency and 2M token context. Optimized for speed without sacrificing quality.',
    context_length: 2000000,
    created: 1706832000, // Feb 2025
    pricing: {
      prompt: '0.00000050', // $0.50 per 1M tokens
      completion: '0.00000150', // $1.50 per 1M tokens
    },
    top_provider: {
      context_length: 2000000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image->text',
      tokenizer: 'Grok',
      instruct_type: 'grok',
    },
    provider: 'x-ai',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.50/1M tokens',
      output: '$1.50/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description:
      'Anthropic\'s Claude 3.5 balanced model. Strong reasoning, coding, and creative capabilities with excellent cost-efficiency.',
    context_length: 200000,
    created: 1719187200, // June 2024
    pricing: {
      prompt: '0.00000300', // $3 per 1M tokens
      completion: '0.00001500', // $15 per 1M tokens
    },
    top_provider: {
      context_length: 200000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image->text',
      tokenizer: 'Claude',
      instruct_type: 'claude',
    },
    provider: 'anthropic',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$3/1M tokens',
      output: '$15/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'google/gemini-2.0-flash-001',
    name: 'Gemini 2.0 Flash',
    description:
      'Fast Gemini 2.0 experimental model with multimodal capabilities. Excellent for high-throughput tasks requiring vision and text.',
    context_length: 1000000,
    created: 1702252800, // Dec 2023
    pricing: {
      prompt: '0.00000010', // $0.10 per 1M tokens
      completion: '0.00000040', // $0.40 per 1M tokens
    },
    top_provider: {
      context_length: 1000000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image->text',
      tokenizer: 'Gemini',
      instruct_type: 'gemini',
    },
    provider: 'google',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.10/1M tokens',
      output: '$0.40/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'openai/o1',
    name: 'o1',
    description:
      'OpenAI\'s advanced reasoning model with extended thinking time. Uses more compute for consistently better answers on complex problems.',
    context_length: 128000,
    created: 1733875200, // Dec 2024
    pricing: {
      prompt: '0.00001500', // $15 per 1M tokens
      completion: '0.00006000', // $60 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 100000,
      is_moderated: true,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'o200k_base',
      instruct_type: 'chatml',
    },
    provider: 'openai',
    category: 'reasoning',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$15/1M tokens',
      output: '$60/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: true,
  },

  {
    id: 'meta-llama/llama-4-scout',
    name: 'Llama 4 Scout',
    description:
      'Meta\'s Llama 4 Scout (109B) with 10M token context (128k-328k via providers). Strong open-source alternative for general tasks.',
    context_length: 328000,
    created: 1743638400, // April 2025
    pricing: {
      prompt: '0.00000008', // $0.08 per 1M tokens
      completion: '0.00000030', // $0.30 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'Llama',
      instruct_type: 'llama',
    },
    provider: 'meta-llama',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.08/1M tokens',
      output: '$0.30/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
  },

  // ========== NEW MODELS - NOVEMBER 2025 UPDATE ==========

  // OpenAI GPT-5 Series
  {
    id: 'openai/gpt-5.1',
    name: 'GPT-5.1',
    description:
      'OpenAI\'s enhanced GPT-5 with stronger reasoning, improved instruction adherence, and natural conversational style. Optimized for math, coding, and structured analysis.',
    context_length: 400000,
    created: 1738368000, // Feb 2025
    pricing: {
      prompt: '0.00000125', // $1.25 per 1M tokens
      completion: '0.00001000', // $10 per 1M tokens
    },
    top_provider: {
      context_length: 400000,
      max_completion_tokens: 128000,
      is_moderated: true,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image+file->text',
      tokenizer: 'o200k_base',
      instruct_type: 'chatml',
    },
    provider: 'openai',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$1.25/1M tokens',
      output: '$10/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'openai/gpt-5-mini',
    name: 'GPT-5 Mini',
    description:
      'Compact GPT-5 model optimized for speed and cost-efficiency while maintaining strong general capabilities.',
    context_length: 256000,
    created: 1735689600, // Jan 2025
    pricing: {
      prompt: '0.00000025', // $0.25 per 1M tokens
      completion: '0.00000200', // $2.00 per 1M tokens
    },
    top_provider: {
      context_length: 256000,
      max_completion_tokens: 64000,
      is_moderated: true,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image->text',
      tokenizer: 'o200k_base',
      instruct_type: 'chatml',
    },
    provider: 'openai',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.25/1M tokens',
      output: '$2.00/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'openai/gpt-5-nano',
    name: 'GPT-5 Nano',
    description:
      'Ultra-lightweight GPT-5 model for high-throughput, low-latency applications with excellent cost efficiency.',
    context_length: 128000,
    created: 1735689600, // Jan 2025
    pricing: {
      prompt: '0.00000005', // $0.05 per 1M tokens
      completion: '0.00000040', // $0.40 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 32000,
      is_moderated: true,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'o200k_base',
      instruct_type: 'chatml',
    },
    provider: 'openai',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.05/1M tokens',
      output: '$0.40/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
  },

  // OpenAI o-series Reasoning Models
  {
    id: 'openai/o3-mini-high',
    name: 'o3 Mini High',
    description:
      'OpenAI o3-mini with high reasoning effort setting. Enhanced performance for complex STEM reasoning tasks.',
    context_length: 128000,
    created: 1738281600, // Jan 2025
    pricing: {
      prompt: '0.00000110', // $1.10 per 1M tokens
      completion: '0.00000440', // $4.40 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 100000,
      is_moderated: true,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'o200k_base',
      instruct_type: 'chatml',
    },
    provider: 'openai',
    category: 'reasoning',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$1.10/1M tokens',
      output: '$4.40/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: true,
  },

  {
    id: 'openai/o4-mini',
    name: 'o4 Mini',
    description:
      'OpenAI o4-mini compact reasoning model optimized for fast, cost-efficient performance with strong multimodal and agentic capabilities.',
    context_length: 128000,
    created: 1740960000, // March 2025
    pricing: {
      prompt: '0.00000110', // $1.10 per 1M tokens
      completion: '0.00000440', // $4.40 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 100000,
      is_moderated: true,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'o200k_base',
      instruct_type: 'chatml',
    },
    provider: 'openai',
    category: 'reasoning',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$1.10/1M tokens',
      output: '$4.40/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: true,
  },

  {
    id: 'openai/o4-mini-high',
    name: 'o4 Mini High',
    description:
      'OpenAI o4-mini with high reasoning effort setting for enhanced accuracy on complex reasoning and coding tasks.',
    context_length: 128000,
    created: 1740960000, // March 2025
    pricing: {
      prompt: '0.00000110', // $1.10 per 1M tokens
      completion: '0.00000440', // $4.40 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 100000,
      is_moderated: true,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'o200k_base',
      instruct_type: 'chatml',
    },
    provider: 'openai',
    category: 'reasoning',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$1.10/1M tokens',
      output: '$4.40/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: true,
  },

  // Anthropic Claude Models
  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude 4.5 Sonnet',
    description:
      'Anthropic\'s Claude Sonnet 4.5 with enhanced coding performance (77.2% on SWE-bench). Industry-leading for complex reasoning and agentic tasks.',
    context_length: 200000,
    created: 1727654400, // Sept 2025
    pricing: {
      prompt: '0.00000300', // $3 per 1M tokens
      completion: '0.00001500', // $15 per 1M tokens
    },
    top_provider: {
      context_length: 200000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image->text',
      tokenizer: 'Claude',
      instruct_type: 'claude',
    },
    provider: 'anthropic',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$3/1M tokens',
      output: '$15/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'anthropic/claude-haiku-4.5',
    name: 'Claude 4.5 Haiku',
    description:
      'Anthropic\'s fastest model delivering near-frontier intelligence at low cost and latency. >73% on SWE-bench, among the world\'s best coding models.',
    context_length: 200000,
    created: 1730419200, // Nov 2024
    pricing: {
      prompt: '0.00000100', // $1 per 1M tokens
      completion: '0.00000500', // $5 per 1M tokens
    },
    top_provider: {
      context_length: 200000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image->text',
      tokenizer: 'Claude',
      instruct_type: 'claude',
    },
    provider: 'anthropic',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$1/1M tokens',
      output: '$5/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'anthropic/claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet',
    description:
      'Claude 3.7 Sonnet with hybrid reasoning approach. Improved coding, especially front-end development, and excellent for agentic workflows.',
    context_length: 200000,
    created: 1727654400, // Sept 2025
    pricing: {
      prompt: '0.00000300', // $3 per 1M tokens
      completion: '0.00001500', // $15 per 1M tokens
    },
    top_provider: {
      context_length: 200000,
      max_completion_tokens: 64000,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image+file->text',
      tokenizer: 'Claude',
      instruct_type: 'claude',
    },
    provider: 'anthropic',
    category: 'general',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$3/1M tokens',
      output: '$15/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'anthropic/claude-3.7-sonnet:thinking',
    name: 'Claude 3.7 Sonnet (Thinking)',
    description:
      'Claude 3.7 Sonnet with extended reasoning mode enabled. Enhanced accuracy for complex math, coding, and instruction-following tasks.',
    context_length: 200000,
    created: 1727654400, // Sept 2025
    pricing: {
      prompt: '0.00000300', // $3 per 1M tokens
      completion: '0.00001500', // $15 per 1M tokens (base rate, higher for thinking tokens)
    },
    top_provider: {
      context_length: 200000,
      max_completion_tokens: 64000,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text+image+file->text',
      tokenizer: 'Claude',
      instruct_type: 'claude',
    },
    provider: 'anthropic',
    category: 'reasoning',
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$3/1M tokens',
      output: '$15/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: true,
  },

  // xAI Grok Models
  {
    id: 'x-ai/grok-3',
    name: 'Grok 3',
    description:
      'xAI\'s Grok 3 model with powerful reasoning capabilities and truth-seeking AI approach.',
    context_length: 128000,
    created: 1698796800, // Nov 2023
    pricing: {
      prompt: '0.00000300', // $3.00 per 1M tokens
      completion: '0.00001500', // $15.00 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'Grok',
      instruct_type: 'grok',
    },
    provider: 'x-ai',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$3.00/1M tokens',
      output: '$15.00/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
  },

  {
    id: 'x-ai/grok-3-mini',
    name: 'Grok 3 Mini',
    description:
      'Compact version of Grok 3 optimized for efficiency while maintaining strong reasoning capabilities.',
    context_length: 128000,
    created: 1698796800, // Nov 2023
    pricing: {
      prompt: '0.00000030', // $0.30 per 1M tokens
      completion: '0.00000050', // $0.50 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'Grok',
      instruct_type: 'grok',
    },
    provider: 'x-ai',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.30/1M tokens',
      output: '$0.50/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
  },

  // DeepSeek Models
  {
    id: 'deepseek/deepseek-chat-v3.1',
    name: 'DeepSeek V3.1',
    description:
      'DeepSeek V3.1 with 671B parameters (37B active). Enhanced performance with both thinking and non-thinking modes.',
    context_length: 64000,
    created: 1709251200, // March 2025
    pricing: {
      prompt: '0.00000020', // $0.20 per 1M tokens
      completion: '0.00000080', // $0.80 per 1M tokens
    },
    top_provider: {
      context_length: 64000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'DeepSeek',
      instruct_type: 'chatml',
    },
    provider: 'deepseek',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.20/1M tokens',
      output: '$0.80/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
  },

  {
    id: 'deepseek/deepseek-chat-v3.1:free',
    name: 'DeepSeek V3.1 (Free)',
    description:
      'Free tier DeepSeek V3.1 with excellent capabilities. Rate-limited but perfect for development and testing.',
    context_length: 64000,
    created: 1709251200, // March 2025
    pricing: {
      prompt: '0', // Free
      completion: '0', // Free
    },
    top_provider: {
      context_length: 64000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'DeepSeek',
      instruct_type: 'chatml',
    },
    provider: 'deepseek',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: 'Free',
      output: 'Free',
    },
    is_free: true,
    supports_vision: false,
    is_reasoning_model: false,
  },

  {
    id: 'deepseek/deepseek-v3.1-terminus',
    name: 'DeepSeek V3.1 Terminus',
    description:
      'Updated DeepSeek V3.1 addressing language consistency and agent capabilities with enhanced performance.',
    context_length: 64000,
    created: 1709251200, // March 2025
    pricing: {
      prompt: '0.00000023', // $0.23 per 1M tokens
      completion: '0.00000090', // $0.90 per 1M tokens
    },
    top_provider: {
      context_length: 64000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'DeepSeek',
      instruct_type: 'chatml',
    },
    provider: 'deepseek',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.23/1M tokens',
      output: '$0.90/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
  },

  {
    id: 'deepseek/deepseek-v3.2-exp',
    name: 'DeepSeek V3.2 Experimental',
    description:
      'Experimental DeepSeek V3.2 introducing DeepSeek Sparse Attention (DSA) for improved efficiency in long-context scenarios.',
    context_length: 64000,
    created: 1709251200, // March 2025
    pricing: {
      prompt: '0.00000027', // $0.27 per 1M tokens
      completion: '0.00000040', // $0.40 per 1M tokens
    },
    top_provider: {
      context_length: 64000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'DeepSeek',
      instruct_type: 'chatml',
    },
    provider: 'deepseek',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.27/1M tokens',
      output: '$0.40/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
  },

  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    description:
      'DeepSeek R1 reasoning model with performance on par with OpenAI o1. 671B parameters (37B active), open-sourced with MIT license.',
    context_length: 163840,
    created: 1736640000, // Jan 2025
    pricing: {
      prompt: '0.00000030', // $0.30 per 1M tokens
      completion: '0.00000120', // $1.20 per 1M tokens
    },
    top_provider: {
      context_length: 163840,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'DeepSeek',
      instruct_type: 'chatml',
    },
    provider: 'deepseek',
    category: 'reasoning',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.30/1M tokens',
      output: '$1.20/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: true,
  },

  // Qwen Models
  {
    id: 'qwen/qwen3-32b',
    name: 'Qwen3 32B',
    description:
      'Qwen3 32B model with strong general capabilities and competitive performance across benchmarks.',
    context_length: 128000,
    created: 1730419200, // Nov 2024
    pricing: {
      prompt: '0.00000005', // $0.05 per 1M tokens
      completion: '0.00000020', // $0.20 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'Qwen',
      instruct_type: 'chatml',
    },
    provider: 'qwen',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.05/1M tokens',
      output: '$0.20/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
  },

  // Meta Llama Models
  {
    id: 'meta-llama/llama-4-maverick',
    name: 'Llama 4 Maverick',
    description:
      'Llama 4 Maverick high-capacity multimodal MoE model with 128 experts and 17B active parameters (400B total).',
    context_length: 128000,
    created: 1743638400, // April 2025
    pricing: {
      prompt: '0.00000015', // $0.15 per 1M tokens
      completion: '0.00000060', // $0.60 per 1M tokens
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'Llama',
      instruct_type: 'llama',
    },
    provider: 'meta-llama',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.15/1M tokens',
      output: '$0.60/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
  },

  // MoonshotAI Kimi Models
  {
    id: 'moonshotai/kimi-k2-0905',
    name: 'Kimi K2',
    description:
      'Kimi K2 Sept 2025 update with 1T total parameters (32B active). Optimized for agentic capabilities, coding, reasoning, and tool-use.',
    context_length: 262144,
    created: 1725494400, // Sept 2025
    pricing: {
      prompt: '0.00000039', // $0.39 per 1M tokens
      completion: '0.00000190', // $1.90 per 1M tokens
    },
    top_provider: {
      context_length: 262144,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    per_request_limits: null,
    architecture: {
      modality: 'text->text',
      tokenizer: 'Kimi',
      instruct_type: 'chatml',
    },
    provider: 'moonshotai',
    category: 'general',
    capabilities: {
      vision: false,
      reasoning: true,
      streaming: true,
      tools: true,
    },
    pricing_display: {
      input: '$0.39/1M tokens',
      output: '$1.90/1M tokens',
    },
    is_free: false,
    supports_vision: false,
    is_reasoning_model: false,
  },
] as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all hardcoded models
 */
export function getAllModels(): readonly HardcodedModel[] {
  return HARDCODED_MODELS;
}

/**
 * Get model by ID
 * Accepts string to allow database lookups, returns undefined if not found
 */
export function getModelById(modelId: string): HardcodedModel | undefined {
  return HARDCODED_MODELS.find(model => model.id === modelId);
}

/**
 * Get models by provider
 */
export function getModelsByProvider(provider: ModelProvider): readonly HardcodedModel[] {
  return HARDCODED_MODELS.filter(model => model.provider === provider);
}

/**
 * Get models by category
 */
export function getModelsByCategory(category: string): readonly HardcodedModel[] {
  return HARDCODED_MODELS.filter(model => model.category === category);
}

/**
 * Get all model IDs
 */
export function getAllModelIds(): readonly ModelId[] {
  return HARDCODED_MODELS.map(model => model.id);
}

/**
 * Check if model ID is valid
 */
export function isValidModelId(modelId: string): modelId is ModelId {
  return ModelIdEnum.safeParse(modelId).success;
}

/**
 * Get models with vision capabilities
 */
export function getVisionModels(): readonly HardcodedModel[] {
  return HARDCODED_MODELS.filter(model => model.supports_vision);
}

/**
 * Get reasoning models
 */
export function getReasoningModels(): readonly HardcodedModel[] {
  return HARDCODED_MODELS.filter(model => model.is_reasoning_model);
}

/**
 * Get all providers
 */
export function getAllProviders(): readonly ModelProvider[] {
  return Array.from(new Set(HARDCODED_MODELS.map(model => model.provider)));
}

/**
 * Extract human-readable model name from model ID
 * Used for changelog entries and user-facing displays
 *
 * @example
 * extractModeratorModelName('anthropic/claude-4.5-sonnet-20250929') // => 'Claude 4.5 Sonnet'
 * extractModeratorModelName('google/gemini-2.5-pro') // => 'Gemini 2.5 Pro'
 */
export function extractModeratorModelName(modelId: string): string {
  const model = getModelById(modelId);
  if (model) {
    return model.name;
  }

  // Fallback: extract from ID if model not found
  const parts = modelId.split('/');
  const modelPart = parts[parts.length - 1] || modelId;

  // Convert kebab-case to Title Case and clean up
  return modelPart
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
    .replace(/\d{8}$/, '') // Remove date suffixes
    .trim();
}
