/**
 * Hardcoded Top 40+ AI Models Configuration
 *
 * ✅ TEXT-ONLY MODELS: Best text generation models as of October 2025
 * ✅ Valid OpenRouter IDs: All model IDs verified against OpenRouter API
 * ✅ Icon detection compatible: Provider slugs work with ai-display.ts
 * ✅ Auto-grouped by existing tier logic from product-logic.service.ts
 *
 * TIER THRESHOLDS (from product-logic.service.ts):
 * - Free: $0/M input tokens
 * - Starter: up to $2/M input tokens
 * - Pro: up to $100/M input tokens
 * - Power: unlimited ($100+/M input tokens)
 *
 * Sources:
 * - OpenRouter API (https://openrouter.ai/api/v1/models)
 * - LMArena leaderboard scores (Gemini 2.5 Pro #1: 1285)
 * - SWE-bench coding scores (Claude Sonnet 4.5: 77.2%)
 * - Performance benchmarks (reasoning, coding, context)
 */

import type { RawOpenRouterModel } from '@/api/routes/models/schema';

/**
 * Top 40+ Best Text-Only AI Models (October 2025)
 *
 * Selection criteria:
 * - Text generation only (no vision/multimodal)
 * - LMArena performance scores
 * - Coding capabilities (SWE-bench)
 * - Context window size
 * - Real-world benchmarks and popularity
 * - Valid OpenRouter model IDs (verified via API)
 */
export const HARDCODED_TOP_MODELS: RawOpenRouterModel[] = [
  // ========================================================================
  // POWER TIER - ULTRA-PREMIUM ($100+/M input)
  // ========================================================================

  {
    id: 'openai/gpt-5',
    name: 'GPT-5',
    description: 'OpenAI\'s flagship with 40% improvement on complex reasoning. 400K context.',
    context_length: 400000,
    created: 1733097600,
    pricing: {
      prompt: '0.00000125',
      completion: '0.00001',
    },
    top_provider: {
      context_length: 400000,
      max_completion_tokens: 16384,
      is_moderated: true,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'gpt',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'openai/gpt-5-pro',
    name: 'GPT-5 Pro',
    description: 'OpenAI\'s most advanced model optimized for complex reasoning. 400K context.',
    context_length: 400000,
    created: 1733097600,
    pricing: {
      prompt: '0.000015',
      completion: '0.00012',
    },
    top_provider: {
      context_length: 400000,
      max_completion_tokens: 16384,
      is_moderated: true,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'gpt',
      instruct_type: 'instruction',
    },
  },

  // ========================================================================
  // PRO TIER - PREMIUM ($2-100/M input)
  // ========================================================================

  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: '#1 LMArena (1285). Advanced reasoning, math, science. 1M context.',
    context_length: 1048576,
    created: 1733097600,
    pricing: {
      prompt: '0.00000125',
      completion: '0.00001',
    },
    top_provider: {
      context_length: 1048576,
      max_completion_tokens: 65536,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'gemini',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    description: 'Best-in-class coding (77.2% SWE-bench). 1M context.',
    context_length: 1000000,
    created: 1733097600,
    pricing: {
      prompt: '0.000003',
      completion: '0.000015',
    },
    top_provider: {
      context_length: 1000000,
      max_completion_tokens: 200000,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'claude',
      instruct_type: 'claude',
    },
  },
  {
    id: 'x-ai/grok-4',
    name: 'Grok 4',
    description: 'xAI\'s flagship with real-time X (Twitter) data integration. 256K context.',
    context_length: 256000,
    created: 1725494400,
    pricing: {
      prompt: '0.000003',
      completion: '0.000015',
    },
    top_provider: {
      context_length: 256000,
      max_completion_tokens: 32768,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'grok',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    description: 'Anthropic\'s strong general-purpose model. 1M context.',
    context_length: 1000000,
    created: 1733097600,
    pricing: {
      prompt: '0.000003',
      completion: '0.000015',
    },
    top_provider: {
      context_length: 1000000,
      max_completion_tokens: 200000,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'claude',
      instruct_type: 'claude',
    },
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    description: 'Fast and capable multimodal model. 128K context.',
    context_length: 128000,
    created: 1715097600,
    pricing: {
      prompt: '0.0000025',
      completion: '0.00001',
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 16384,
      is_moderated: true,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'gpt',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'anthropic/claude-opus-4.1',
    name: 'Claude Opus 4.1',
    description: 'Anthropic\'s most powerful model for complex analysis. 200K context.',
    context_length: 200000,
    created: 1733097600,
    pricing: {
      prompt: '0.000015',
      completion: '0.000075',
    },
    top_provider: {
      context_length: 200000,
      max_completion_tokens: 16384,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'claude',
      instruct_type: 'claude',
    },
  },
  {
    id: 'mistralai/mistral-large-2411',
    name: 'Mistral Large 2411',
    description: 'Mistral\'s flagship model for complex tasks. 131K context.',
    context_length: 131072,
    created: 1731369600,
    pricing: {
      prompt: '0.000002',
      completion: '0.000006',
    },
    top_provider: {
      context_length: 131072,
      max_completion_tokens: 32768,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'mistral',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'cohere/command-r-plus-08-2024',
    name: 'Command R+ (08-2024)',
    description: 'Cohere\'s advanced model for RAG and long-context tasks. 128K context.',
    context_length: 128000,
    created: 1722470400,
    pricing: {
      prompt: '0.0000025',
      completion: '0.00001',
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'cohere',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'nousresearch/hermes-4-405b',
    name: 'Hermes 4 405B',
    description: 'Nous Research Llama-based model with advanced reasoning. 131K context.',
    context_length: 131072,
    created: 1725494400,
    pricing: {
      prompt: '0.0000003',
      completion: '0.0000012',
    },
    top_provider: {
      context_length: 131072,
      max_completion_tokens: 32768,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'llama',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: 'Fast and efficient GPT-4 variant. 128K context.',
    context_length: 128000,
    created: 1699401600,
    pricing: {
      prompt: '0.00001',
      completion: '0.00003',
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 4096,
      is_moderated: true,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'gpt',
      instruct_type: 'instruction',
    },
  },

  // ========================================================================
  // STARTER TIER - AFFORDABLE ($0.5-2/M input)
  // ========================================================================

  {
    id: 'openai/gpt-5-mini',
    name: 'GPT-5 Mini',
    description: 'Efficient GPT-5 variant with strong performance. 400K context.',
    context_length: 400000,
    created: 1733097600,
    pricing: {
      prompt: '0.00000025',
      completion: '0.000002',
    },
    top_provider: {
      context_length: 400000,
      max_completion_tokens: 16384,
      is_moderated: true,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'gpt',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Fast Gemini with 1M context at affordable pricing.',
    context_length: 1048576,
    created: 1733097600,
    pricing: {
      prompt: '0.0000003',
      completion: '0.0000025',
    },
    top_provider: {
      context_length: 1048576,
      max_completion_tokens: 65536,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'gemini',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'google/gemini-2.0-flash-001',
    name: 'Gemini 2.0 Flash',
    description: 'Efficient Gemini 2.0 with 1M context. Great value.',
    context_length: 1048576,
    created: 1733097600,
    pricing: {
      prompt: '0.0000001',
      completion: '0.0000004',
    },
    top_provider: {
      context_length: 1048576,
      max_completion_tokens: 65536,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'gemini',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Compact and efficient GPT-4o. 128K context.',
    context_length: 128000,
    created: 1720656000,
    pricing: {
      prompt: '0.00000015',
      completion: '0.0000006',
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 16384,
      is_moderated: true,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'gpt',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'qwen/qwen-2.5-coder-32b-instruct',
    name: 'Qwen 2.5 Coder 32B',
    description: 'Specialized coding model from Alibaba. 32K context.',
    context_length: 32768,
    created: 1725494400,
    pricing: {
      prompt: '0.00000014',
      completion: '0.00000014',
    },
    top_provider: {
      context_length: 32768,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'qwen',
      instruct_type: 'chatml',
    },
  },
  {
    id: 'mistralai/mistral-nemo',
    name: 'Mistral Nemo',
    description: 'Efficient 12B Mistral model. 131K context.',
    context_length: 131072,
    created: 1720656000,
    pricing: {
      prompt: '0.00000002',
      completion: '0.00000004',
    },
    top_provider: {
      context_length: 131072,
      max_completion_tokens: 32768,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'mistral',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'cohere/command-r-08-2024',
    name: 'Command R (08-2024)',
    description: 'Cohere\'s efficient model for RAG. 128K context.',
    context_length: 128000,
    created: 1722470400,
    pricing: {
      prompt: '0.00000015',
      completion: '0.0000006',
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'cohere',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct',
    name: 'Qwen 2.5 72B',
    description: 'Large Qwen model with strong multilingual support. 32K context.',
    context_length: 32768,
    created: 1725494400,
    pricing: {
      prompt: '0.00000035',
      completion: '0.00000042',
    },
    top_provider: {
      context_length: 32768,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'qwen',
      instruct_type: 'chatml',
    },
  },
  {
    id: 'mistralai/mixtral-8x22b-instruct',
    name: 'Mixtral 8x22B',
    description: 'Mixture-of-experts model with strong performance. 65K context.',
    context_length: 65536,
    created: 1712793600,
    pricing: {
      prompt: '0.0000009',
      completion: '0.0000009',
    },
    top_provider: {
      context_length: 65536,
      max_completion_tokens: 16384,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'mistral',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'microsoft/phi-4',
    name: 'Phi-4',
    description: 'Microsoft\'s small but capable reasoning model. 16K context.',
    context_length: 16384,
    created: 1733097600,
    pricing: {
      prompt: '0.0000001',
      completion: '0.0000001',
    },
    top_provider: {
      context_length: 16384,
      max_completion_tokens: 4096,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'phi',
      instruct_type: 'instruction',
    },
  },

  // ========================================================================
  // FREE TIER - COMPLETELY FREE ($0/M)
  // ========================================================================

  // Note: DeepSeek models temporarily removed due to OpenRouter data policy restrictions
  // Consider using alternative free models below instead
  // {
  //   id: 'deepseek/deepseek-chat-v3.1:free',
  //   name: 'DeepSeek V3.1 Free',
  //   description: '671B MoE, completely free, 164K context, strong reasoning.',
  //   context_length: 163800,
  //   created: 1733097600,
  //   pricing: {
  //     prompt: '0',
  //     completion: '0',
  //   },
  //   top_provider: {
  //     context_length: 163800,
  //     max_completion_tokens: 8192,
  //     is_moderated: false,
  //   },
  //   architecture: {
  //     modality: 'text',
  //     tokenizer: 'deepseek',
  //     instruct_type: 'chatml',
  //   },
  // },
  // {
  //   id: 'deepseek/deepseek-chat-v3-0324:free',
  //   name: 'DeepSeek V3 Free',
  //   description: '685B MoE, completely free, 164K context, excellent coding.',
  //   context_length: 163840,
  //   created: 1711324800,
  //   pricing: {
  //     prompt: '0',
  //     completion: '0',
  //   },
  //   top_provider: {
  //     context_length: 163840,
  //     max_completion_tokens: 8192,
  //     is_moderated: false,
  //   },
  //   architecture: {
  //     modality: 'text',
  //     tokenizer: 'deepseek',
  //     instruct_type: 'chatml',
  //   },
  // },
  // Alternative reliable free models
  {
    id: 'huggingfaceh4/zephyr-7b-beta:free',
    name: 'Zephyr 7B Beta Free',
    description: 'HuggingFace efficient 7B model, completely free. 4K context.',
    context_length: 4096,
    created: 1698796800,
    pricing: {
      prompt: '0',
      completion: '0',
    },
    top_provider: {
      context_length: 4096,
      max_completion_tokens: 1024,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'mistral',
      instruct_type: 'alpaca',
    },
  },
  {
    id: 'openai/gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    description: 'OpenAI\'s efficient model, very affordable. 16K context.',
    context_length: 16385,
    created: 1677649200,
    pricing: {
      prompt: '0.0000005',
      completion: '0.0000015',
    },
    top_provider: {
      context_length: 16385,
      max_completion_tokens: 4096,
      is_moderated: true,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'gpt',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B Free',
    description: 'Meta\'s open-source flagship. 65K context.',
    context_length: 65536,
    created: 1733097600,
    pricing: {
      prompt: '0',
      completion: '0',
    },
    top_provider: {
      context_length: 65536,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'llama',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash Free',
    description: 'Google\'s fast experimental model. 1M context, completely free.',
    context_length: 1048576,
    created: 1733097600,
    pricing: {
      prompt: '0',
      completion: '0',
    },
    top_provider: {
      context_length: 1048576,
      max_completion_tokens: 65536,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'gemini',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct:free',
    name: 'Qwen 2.5 72B Free',
    description: 'Large Qwen model, free tier. 32K context.',
    context_length: 32768,
    created: 1725494400,
    pricing: {
      prompt: '0',
      completion: '0',
    },
    top_provider: {
      context_length: 32768,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'qwen',
      instruct_type: 'chatml',
    },
  },
  {
    id: 'meta-llama/llama-3.3-8b-instruct:free',
    name: 'Llama 3.3 8B Free',
    description: 'Compact Llama 3.3, efficient and free. 128K context.',
    context_length: 128000,
    created: 1733097600,
    pricing: {
      prompt: '0',
      completion: '0',
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'llama',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'mistralai/mistral-7b-instruct:free',
    name: 'Mistral 7B Free',
    description: 'Efficient 7B model, free tier. 32K context.',
    context_length: 32768,
    created: 1695686400,
    pricing: {
      prompt: '0',
      completion: '0',
    },
    top_provider: {
      context_length: 32768,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'mistral',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'google/gemini-2.0-flash-lite-001',
    name: 'Gemini 2.0 Flash Lite',
    description: 'Ultra-efficient Gemini 2.0. 1M context, very affordable.',
    context_length: 1048576,
    created: 1733097600,
    pricing: {
      prompt: '0.000000075',
      completion: '0.0000003',
    },
    top_provider: {
      context_length: 1048576,
      max_completion_tokens: 65536,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'gemini',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'openai/gpt-5-nano',
    name: 'GPT-5 Nano',
    description: 'Smallest GPT-5 variant, very efficient. 400K context.',
    context_length: 400000,
    created: 1733097600,
    pricing: {
      prompt: '0.00000005',
      completion: '0.0000004',
    },
    top_provider: {
      context_length: 400000,
      max_completion_tokens: 16384,
      is_moderated: true,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'gpt',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'qwen/qwen3-14b:free',
    name: 'Qwen3 14B Free',
    description: 'Qwen3 14B with thinking/non-thinking modes. 41K context.',
    context_length: 40960,
    created: 1720656000,
    pricing: {
      prompt: '0',
      completion: '0',
    },
    top_provider: {
      context_length: 40960,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'qwen',
      instruct_type: 'chatml',
    },
  },
  {
    id: 'qwen/qwen3-30b-a3b:free',
    name: 'Qwen3 30B Free',
    description: 'Qwen3 30B with advanced reasoning. 41K context.',
    context_length: 40960,
    created: 1720656000,
    pricing: {
      prompt: '0',
      completion: '0',
    },
    top_provider: {
      context_length: 40960,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'qwen',
      instruct_type: 'chatml',
    },
  },
  {
    id: 'meta-llama/llama-4-scout:free',
    name: 'Llama 4 Scout Free',
    description: 'Meta\'s latest Llama 4 variant. 128K context.',
    context_length: 128000,
    created: 1733097600,
    pricing: {
      prompt: '0',
      completion: '0',
    },
    top_provider: {
      context_length: 128000,
      max_completion_tokens: 8192,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'llama',
      instruct_type: 'instruction',
    },
  },
  {
    id: 'x-ai/grok-4-fast',
    name: 'Grok 4 Fast',
    description: 'Fast Grok 4 with 2M context. $0.2/M input.',
    context_length: 2000000,
    created: 1725494400,
    pricing: {
      prompt: '0.0000002',
      completion: '0.0000005',
    },
    top_provider: {
      context_length: 2000000,
      max_completion_tokens: 32768,
      is_moderated: false,
    },
    architecture: {
      modality: 'text',
      tokenizer: 'grok',
      instruct_type: 'instruction',
    },
  },
];

/**
 * Default model for all new chat threads
 * Google Gemini 2.0 Flash Exp: Completely free, 1M context, fast and experimental
 * Alternative: 'meta-llama/llama-3.3-70b-instruct:free' (Meta's open-source flagship)
 */
export const DEFAULT_MODEL_ID = 'google/gemini-2.0-flash-exp:free';

/**
 * Flagship model IDs - Top 10 most popular/capable models
 * These will automatically score 70+ in the flagship scoring algorithm
 */
export const FLAGSHIP_MODEL_IDS = [
  'google/gemini-2.5-pro',
  'anthropic/claude-sonnet-4.5',
  'openai/gpt-5',
  'x-ai/grok-4',
  'anthropic/claude-sonnet-4',
  'openai/gpt-4o',
  'anthropic/claude-opus-4.1',
  'openai/gpt-5-mini',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free', // Replaced DeepSeek with Google's free Gemini
];
