import { z } from '@hono/zod-openapi';

import {
  ModelCategorySchema,
  PROVIDER_STREAMING_DEFAULTS,
  StreamingBehaviors,
  StreamingBehaviorSchema,
} from '@/api/core/enums';

export const ModelIdEnum = z.enum([
  'openai/gpt-oss-120b',
  'openai/gpt-5-nano',
  'google/gemini-2.0-flash-001',
  'openai/gpt-4.1-nano',
  'openai/gpt-4o-mini',
  'x-ai/grok-4-fast',
  'x-ai/grok-4.1-fast',
  'x-ai/grok-code-fast-1',
  'deepseek/deepseek-chat-v3-0324',
  'deepseek/deepseek-r1-0528',
  'deepseek/deepseek-v3.2',
  'google/gemini-2.5-flash',
  'openai/gpt-5-mini',
  'openai/gpt-4.1-mini',
  'mistralai/mistral-large-2512',
  'google/gemini-3-flash-preview',
  'anthropic/claude-haiku-4.5',
  'openai/o3-mini',
  'openai/o4-mini',
  'google/gemini-2.5-pro',
  'openai/gpt-5',
  'openai/gpt-5.1',
  'openai/gpt-5.2',
  'openai/o3',
  'openai/gpt-4.1',
  'google/gemini-3-pro-preview',
  'x-ai/grok-3',
  'x-ai/grok-4',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-opus-4.5',
  'openai/o1',
  'anthropic/claude-opus-4',
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
  streaming_behavior: StreamingBehaviorSchema.optional(),
});

export type HardcodedModel = z.infer<typeof HardcodedModelSchema>;

export const HARDCODED_MODELS: readonly HardcodedModel[] = [
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    description: 'Budget-friendly thinker. Good for everyday questions and quick reasoning tasks.',
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
    description: 'Lightning-fast responder. Perfect for quick answers and simple tasks.',
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
    description: 'Speed champion. Great for rapid brainstorming and processing images.',
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
    description: 'Efficient helper. Ideal for sorting ideas and finishing your sentences.',
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
    description: 'Reliable all-rounder. Balanced performance for most everyday tasks.',
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
    description: 'Memory powerhouse. Can remember extremely long conversations.',
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
    description: 'Smart assistant. Handles long docs and can take actions for you.',
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
    description: 'Code specialist. Shows its thinking while solving programming problems.',
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
    description: 'Friendly conversationalist. Natural dialogue at an affordable price.',
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
    description: 'Deep thinker. Takes time to reason through complex problems carefully.',
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
    description: 'Context master. Excels at analyzing long documents and conversations.',
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
    description: 'Analytical mind. Strong at math, coding, and technical problems.',
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
    description: 'Smart and snappy. Balanced intelligence with quick responses.',
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
    description: 'Capable workhorse. Handles complex tasks without breaking the bank.',
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
    description: 'European powerhouse. Great for multilingual and creative writing.',
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
    description: 'Flexible thinker. Adjusts how deeply it thinks based on your needs.',
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
    description: 'Quick but thoughtful. Fast responses with careful reasoning.',
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
    description: 'Science whiz. Excellent for math, physics, and technical questions.',
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
    description: 'Visual problem solver. Reasons through images and diagrams.',
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
    description: 'Top performer. Excels at complex reasoning across all domains.',
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
    description: 'Premium intelligence. Exceptional at nuanced, complex tasks.',
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
    description: 'Natural conversationalist. Thoughtful responses that feel human.',
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
    description: 'Power user\'s choice. Handles complex projects and long documents.',
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
    description: 'Ultimate problem solver. Excels at math, science, and coding challenges.',
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
    description: 'Versatile expert. Strong across writing, analysis, and coding.',
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
    description: 'Multimedia master. Analyzes text, images, video, and audio together.',
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
    description: 'Domain specialist. Deep expertise in finance, healthcare, and law.',
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
    description: 'Advanced reasoner. Tackles tough problems with multiple tools at once.',
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
    description: 'Coding champion. Excels at software development and agentic tasks.',
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
    description: 'Balanced brilliance. Thoughtful, nuanced, and great at writing.',
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
    description: 'The deep thinker. Best for complex analysis and creative projects.',
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
    description: 'Maximum reasoning. For the most challenging problems requiring deep thought.',
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
    description: 'Elite coder. The world\'s top model for software engineering.',
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
export function getAllModels() {
  return HARDCODED_MODELS;
}

export function getModelById(modelId: string) {
  return HARDCODED_MODELS.find(model => model.id === modelId);
}

export function extractModeratorModelName(modelId: string) {
  const model = getModelById(modelId);
  if (model)
    return model.name;

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
 */
export function getModelStreamingBehavior(modelId: string) {
  const model = getModelById(modelId);
  if (model?.streaming_behavior)
    return model.streaming_behavior;

  const provider = modelId.split('/')[0] || '';
  return PROVIDER_STREAMING_DEFAULTS[provider] ?? StreamingBehaviors.TOKEN;
}

/**
 * ✅ NEEDS SMOOTH STREAM: Quick check if model needs chunk normalization
 *
 * Returns true if the model buffers responses server-side and needs
 * smoothStream to normalize chunk delivery for consistent UI rendering.
 */
export function needsSmoothStream(modelId: string) {
  return getModelStreamingBehavior(modelId) === StreamingBehaviors.BUFFERED;
}
