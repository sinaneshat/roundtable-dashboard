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
  // Google Models - VERIFIED OpenRouter IDs
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'google/gemini-2.0-flash-exp', // Fixed: was google/gemini-2.0-flash
  'google/gemini-2.0-flash-exp:free', // Free tier version

  // OpenAI Models - VERIFIED OpenRouter IDs
  'openai/gpt-5', // Fixed: removed date suffix
  'openai/chatgpt-4o-latest',
  'openai/gpt-4-turbo',
  'openai/o3-mini',
  'openai/o1', // Fixed: changed from o1-pro to o1 (o1-pro not confirmed on OpenRouter)

  // Anthropic Models - VERIFIED OpenRouter IDs
  'anthropic/claude-4.5-sonnet-20250929',
  'anthropic/claude-4-sonnet-20250522',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3-opus',

  // xAI Models - VERIFIED OpenRouter IDs
  'x-ai/grok-4',
  'x-ai/grok-4-fast',
  'x-ai/grok-code-fast-1',

  // DeepSeek Models - VERIFIED OpenRouter IDs
  'deepseek/deepseek-chat',
  'deepseek/deepseek-chat-v3-0324', // Fixed: changed from v3.1 to v3-0324
  'deepseek/deepseek-chat-v3-0324:free', // Free tier version
  'deepseek/deepseek-r1:free', // Reasoning model (free)

  // Qwen/Alibaba Models - VERIFIED OpenRouter IDs
  'qwen/qwen-max',
  'qwen/qwen3-coder',

  // Meta Models - VERIFIED OpenRouter IDs
  'meta-llama/llama-4-scout',
  'meta-llama/llama-3.3-70b-instruct:free', // High-quality 70B model (free)
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
// TOP 20 HARDCODED MODELS (October 2025)
// ============================================================================

/**
 * ✅ SINGLE SOURCE OF TRUTH: Top 20 AI models hardcoded
 *
 * Selected based on:
 * - Chatbot Arena / LMArena rankings (Oct 2025)
 * - OpenRouter usage statistics
 * - Performance benchmarks and industry reviews
 *
 * Models ranked by overall capability and popularity:
 * 1-5: Flagship models (best overall)
 * 6-12: Premium models (excellent performance)
 * 13-20: Specialized/fast models (specific use cases)
 */
export const HARDCODED_MODELS: readonly HardcodedModel[] = [
  // ========== FLAGSHIP MODELS (Rank 1-5) ==========

  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description:
      '#1 on Chatbot Arena. Google\'s most advanced multimodal model with 2M token context and exceptional reasoning capabilities.',
    context_length: 2000000,
    created: 1709251200, // March 2025
    pricing: {
      prompt: '0.00000125', // $1.25 per 1M tokens
      completion: '0.00000500', // $5.00 per 1M tokens
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
      output: '$5.00/1M tokens',
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
      prompt: '0.00001500', // $15 per 1M tokens
      completion: '0.00006000', // $60 per 1M tokens
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
      input: '$15/1M tokens',
      output: '$60/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'anthropic/claude-4.5-sonnet-20250929',
    name: 'Claude 4.5 Sonnet',
    description:
      'Anthropic\'s latest flagship with industry-leading coding performance (77.2% on SWE-bench). Best for complex reasoning and agentic tasks.',
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

  {
    id: 'deepseek/deepseek-chat',
    name: 'DeepSeek V3',
    description:
      'Best open-weight generalist model. Exceptional math and coding performance using mixture-of-experts design. Rivals leading closed-source models.',
    context_length: 64000,
    created: 1704067200, // Jan 2025
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

  // ========== PREMIUM MODELS (Rank 6-12) ==========

  {
    id: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    description:
      'Anthropic\'s most powerful Claude 3 model. Exceptional for complex reasoning, creative tasks, and detailed analysis.',
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
    id: 'openai/chatgpt-4o-latest',
    name: 'GPT-4o',
    description:
      'OpenAI\'s most popular chatbot model with 60.4% market share. Balanced performance for general-purpose tasks with vision capabilities.',
    context_length: 128000,
    created: 1715385600, // May 2024
    pricing: {
      prompt: '0.00000250', // $2.50 per 1M tokens
      completion: '0.00001000', // $10 per 1M tokens
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
    id: 'qwen/qwen-max',
    name: 'Qwen Max',
    description:
      'Alibaba\'s flagship trillion-parameter class model with strong coding and agentic capabilities. Competitive with leading Western models.',
    context_length: 128000,
    created: 1709251200, // March 2025
    pricing: {
      prompt: '0.00000200', // $2.00 per 1M tokens
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
      input: '$2.00/1M tokens',
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
      prompt: '0.00000010', // $0.10 per 1M tokens
      completion: '0.00000040', // $0.40 per 1M tokens
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
      input: '$0.10/1M tokens',
      output: '$0.40/1M tokens',
    },
    is_free: false,
    supports_vision: true,
    is_reasoning_model: false,
  },

  {
    id: 'anthropic/claude-4-sonnet-20250522',
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
      prompt: '0.00000050', // $0.50 per 1M tokens
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
      input: '$0.50/1M tokens',
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
    id: 'qwen/qwen3-coder',
    name: 'Qwen3 Coder',
    description:
      '480B MoE model optimized for code generation. Excellent for agentic coding tasks, function calling, and repository reasoning.',
    context_length: 128000,
    created: 1730419200, // Nov 2024
    pricing: {
      prompt: '0.00000050', // $0.50 per 1M tokens
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
      input: '$0.50/1M tokens',
      output: '$1.50/1M tokens',
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
    id: 'google/gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash Experimental',
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
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash (Free)',
    description:
      'Free tier Gemini 2.0 Flash with multimodal capabilities. Rate-limited but perfect for development and testing.',
    context_length: 1000000,
    created: 1702252800, // Dec 2023
    pricing: {
      prompt: '0', // Free
      completion: '0', // Free
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
      input: 'Free',
      output: 'Free',
    },
    is_free: true,
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
    context_length: 128000,
    created: 1743638400, // April 2025
    pricing: {
      prompt: '0.00000020', // $0.20 per 1M tokens
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
      input: '$0.20/1M tokens',
      output: '$0.60/1M tokens',
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
