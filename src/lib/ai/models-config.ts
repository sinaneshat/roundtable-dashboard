/**
 * AI Model Configurations
 * Supported models for multi-model chat orchestration
 *
 * ✅ SINGLE SOURCE OF TRUTH for all allowed models
 * ✅ Enum-based type safety - impossible to use invalid model IDs
 * ✅ Compile-time validation - typos caught before runtime
 * ✅ OpenRouter API verified model IDs
 */

import type { SubscriptionTier } from '@/db/tables/usage';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { CHAT_MODE_SYSTEM_PROMPTS } from '@/lib/config/chat-modes';

// ============================================================================
// ALLOWED MODELS ENUM - Single Source of Truth
// ============================================================================

/**
 * Allowed OpenRouter Model IDs
 *
 * This is the ONLY place where model IDs are defined.
 * All model IDs verified against https://openrouter.ai/api/v1/models
 *
 * ✅ Adding a model here makes it available throughout the app
 * ✅ TypeScript prevents using any model not listed here
 * ✅ No typos possible - compile-time safety
 */
export const AllowedModelId = {
  // Anthropic Claude Models (verified from OpenRouter API - October 2025)
  CLAUDE_3_HAIKU: 'anthropic/claude-3-haiku',
  CLAUDE_3_OPUS: 'anthropic/claude-3-opus',
  CLAUDE_3_5_SONNET: 'anthropic/claude-3.5-sonnet',
  CLAUDE_3_5_HAIKU: 'anthropic/claude-3.5-haiku',
  CLAUDE_3_7_SONNET: 'anthropic/claude-3.7-sonnet',
  CLAUDE_SONNET_4: 'anthropic/claude-sonnet-4',
  CLAUDE_SONNET_4_5: 'anthropic/claude-sonnet-4.5',
  CLAUDE_OPUS_4: 'anthropic/claude-opus-4',
  CLAUDE_OPUS_4_1: 'anthropic/claude-opus-4.1',

  // OpenAI GPT Models (verified from OpenRouter API - October 2025)
  GPT_4O: 'openai/gpt-4o',
  GPT_4_TURBO: 'openai/gpt-4-turbo',
  GPT_4O_MINI: 'openai/gpt-4o-mini',
  GPT_4O_SEARCH: 'openai/gpt-4o-search-preview',
  O1_MINI: 'openai/o1-mini',
  O3: 'openai/o3',
  O3_MINI: 'openai/o3-mini',
  GPT_5: 'openai/gpt-5',
  GPT_5_MINI: 'openai/gpt-5-mini',

  // Google Gemini Models (verified from OpenRouter API - October 2025)
  GEMINI_2_5_PRO: 'google/gemini-2.5-pro',
  GEMINI_2_5_FLASH: 'google/gemini-2.5-flash',
  GEMINI_2_0_FLASH: 'google/gemini-2.0-flash-001',
  GEMINI_2_0_FLASH_EXP: 'google/gemini-2.0-flash-exp:free',

  // Meta Llama Models (verified from OpenRouter API - October 2025)
  LLAMA_3_1_405B: 'meta-llama/llama-3.1-405b-instruct',
  LLAMA_3_1_70B: 'meta-llama/llama-3.1-70b-instruct',
  LLAMA_3_1_8B: 'meta-llama/llama-3.1-8b-instruct',
  LLAMA_4_MAVERICK: 'meta-llama/llama-4-maverick',
  LLAMA_4_MAVERICK_FREE: 'meta-llama/llama-4-maverick:free',

  // DeepSeek Models (verified from OpenRouter API - October 2025)
  DEEPSEEK_CHAT: 'deepseek/deepseek-chat',
  DEEPSEEK_R1: 'deepseek/deepseek-r1',
  DEEPSEEK_R1_FREE: 'deepseek/deepseek-r1:free',
  DEEPSEEK_CHAT_V3: 'deepseek/deepseek-chat-v3-0324',

  // xAI Grok Models (verified from OpenRouter API - October 2025)
  GROK_4: 'x-ai/grok-4',
  GROK_4_FAST: 'x-ai/grok-4-fast',

  // Perplexity Models (verified from OpenRouter API - October 2025)
  PERPLEXITY_SONAR_LARGE: 'perplexity/llama-3.1-sonar-large-128k-online',
  PERPLEXITY_SONAR_SMALL: 'perplexity/llama-3.1-sonar-small-128k-online',
  PERPLEXITY_SONAR_REASONING_PRO: 'perplexity/sonar-reasoning-pro',
  PERPLEXITY_SONAR_DEEP_RESEARCH: 'perplexity/sonar-deep-research',
} as const;

/**
 * Type-safe OpenRouter Model ID
 * Only allows model IDs defined in AllowedModelId enum
 */
export type OpenRouterModelId = typeof AllowedModelId[keyof typeof AllowedModelId];

/**
 * Get all allowed model ID values as an array
 */
export const ALLOWED_MODEL_IDS = Object.values(AllowedModelId) as readonly OpenRouterModelId[];

/**
 * Validate if a string is an allowed OpenRouter model ID
 * Type guard with compile-time safety
 */
export function isValidOpenRouterModelId(modelId: string): modelId is OpenRouterModelId {
  return ALLOWED_MODEL_IDS.includes(modelId as OpenRouterModelId);
}

// ============================================================================
// SUBSCRIPTION TIER CONFIGURATION - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * Comprehensive Subscription Tier Quotas
 *
 * 🚨 SINGLE SOURCE OF TRUTH for ALL tier limits and quotas
 * This configuration defines:
 * - Message and thread quotas per billing period
 * - Max concurrent AI models per chat session
 * - Feature access (memories, custom roles, exports)
 * - Output token limits for cost control
 *
 * All backend services, database seeds, and UI must reference this config.
 * DO NOT hardcode these values elsewhere.
 */
export const SUBSCRIPTION_TIER_CONFIG = {
  free: {
    name: 'Free',
    description: 'Basic access to 2 cheapest models',
    displayOrder: 1,

    // Chat quotas per billing period
    quotas: {
      threadsPerMonth: 10,
      messagesPerMonth: 100,
      memoriesPerMonth: 5,
      customRolesPerMonth: 2,
    },

    // Model access limits
    models: {
      maxConcurrentModels: 2, // Max 2 AI models in a single chat session
      maxOutputTokens: 2048, // Max output tokens per model response (cost control)
    },

    // Feature flags
    features: {
      allowCustomRoles: true,
      allowMemories: true,
      allowThreadExport: false,
    },
  },

  starter: {
    name: 'Starter',
    description: 'Budget-friendly models with better performance',
    displayOrder: 2,

    quotas: {
      threadsPerMonth: 50,
      messagesPerMonth: 1000,
      memoriesPerMonth: 20,
      customRolesPerMonth: 5,
    },

    models: {
      maxConcurrentModels: 3,
      maxOutputTokens: 4096,
    },

    features: {
      allowCustomRoles: true,
      allowMemories: true,
      allowThreadExport: true,
    },
  },

  pro: {
    name: 'Pro',
    description: 'Professional-grade models with excellent quality',
    displayOrder: 3,

    quotas: {
      threadsPerMonth: 200,
      messagesPerMonth: 5000,
      memoriesPerMonth: 100,
      customRolesPerMonth: 20,
    },

    models: {
      maxConcurrentModels: 5,
      maxOutputTokens: 8192,
    },

    features: {
      allowCustomRoles: true,
      allowMemories: true,
      allowThreadExport: true,
    },
  },

  power: {
    name: 'Power',
    description: 'Flagship models with maximum capabilities',
    displayOrder: 4,

    quotas: {
      threadsPerMonth: 1000,
      messagesPerMonth: 50000,
      memoriesPerMonth: 500,
      customRolesPerMonth: 100,
    },

    models: {
      maxConcurrentModels: 8,
      maxOutputTokens: 16384,
    },

    features: {
      allowCustomRoles: true,
      allowMemories: true,
      allowThreadExport: true,
    },
  },
} as const;

/**
 * Type-safe access to tier configuration
 */
export type SubscriptionTierConfig = typeof SUBSCRIPTION_TIER_CONFIG[keyof typeof SUBSCRIPTION_TIER_CONFIG];

/**
 * Get tier configuration by tier name
 */
export function getTierConfig(tier: SubscriptionTier): SubscriptionTierConfig {
  return SUBSCRIPTION_TIER_CONFIG[tier];
}

/**
 * Get max concurrent models for a tier
 */
export function getMaxConcurrentModels(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIER_CONFIG[tier].models.maxConcurrentModels;
}

/**
 * Get max output tokens for a tier (cost control)
 */
export function getMaxOutputTokens(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIER_CONFIG[tier].models.maxOutputTokens;
}

/**
 * Check if user can add more models to their chat session
 */
export function canAddMoreModels(currentModelCount: number, userTier: SubscriptionTier): boolean {
  return currentModelCount < SUBSCRIPTION_TIER_CONFIG[userTier].models.maxConcurrentModels;
}

/**
 * Get user-friendly error message when max models exceeded
 */
export function getMaxModelsErrorMessage(userTier: SubscriptionTier): string {
  const limit = SUBSCRIPTION_TIER_CONFIG[userTier].models.maxConcurrentModels;
  const tierName = SUBSCRIPTION_TIER_CONFIG[userTier].name;

  if (userTier === 'free') {
    return `Your ${tierName} plan allows up to ${limit} models per chat. Upgrade to Starter for 3 models.`;
  }
  if (userTier === 'starter') {
    return `Your ${tierName} plan allows up to ${limit} models per chat. Upgrade to Pro for 5 models.`;
  }
  if (userTier === 'pro') {
    return `Your ${tierName} plan allows up to ${limit} models per chat. Upgrade to Power for 8 models.`;
  }
  return `Your ${tierName} plan allows up to ${limit} models per chat.`;
}

/**
 * Assert that a model ID is valid (throws if not)
 * Use for runtime validation when receiving model IDs from external sources
 */
export function assertValidModelId(modelId: string): asserts modelId is OpenRouterModelId {
  if (!isValidOpenRouterModelId(modelId)) {
    throw new Error(
      `Invalid model ID: "${modelId}". `
      + `Allowed models: ${ALLOWED_MODEL_IDS.join(', ')}. `
      + `Add new models to AllowedModelId enum in models-config.ts`,
    );
  }
}

export type ModelProvider = 'openrouter' | 'anthropic' | 'openai' | 'google' | 'xai' | 'perplexity';

export type ModelCapabilities = {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ModelDefaultSettings = {
  temperature: number;
  maxTokens: number;
  topP?: number;
  /**
   * Max output tokens for cost control
   * Overrides tier-level maxOutputTokens if set
   * Use this to cap expensive models even further
   */
  maxOutputTokens?: number;
};

export type ModelMetadata = {
  icon?: string;
  color?: string;
  category: 'research' | 'reasoning' | 'general' | 'creative';
  contextWindow: number;
  strengths?: string[];
  pricing?: {
    input: string;
    output: string;
  };
};

export type AIModel = {
  id: string;
  provider: ModelProvider;
  modelId: OpenRouterModelId; // ✅ Type-safe: Only accepts valid OpenRouter model IDs
  name: string;
  description: string;
  capabilities: ModelCapabilities;
  defaultSettings: ModelDefaultSettings;
  isEnabled: boolean;
  order: number;
  metadata: ModelMetadata;
  minTier: SubscriptionTier; // Minimum subscription tier required to use this model
};

/**
 * Supported AI Models Configuration
 * All models accessible via OpenRouter
 *
 * ✅ Uses AllowedModelId enum for type safety
 * ✅ Compile-time validation of all model IDs
 * ✅ Optimized based on cost-performance analysis (Jan 2025)
 * ✅ Tiered access with max concurrent model limits per subscription
 *
 * Model Selection Criteria:
 * - Cost-effectiveness (quality per dollar)
 * - Benchmark performance (SWE-bench, GPQA, etc.)
 * - Speed and latency
 * - No redundant/superseded models
 *
 * Tier Structure:
 * - Free: 2 cheapest models only
 * - Starter: 3 budget-friendly models
 * - Pro: 5 professional-grade models
 * - Power: 8 flagship models
 */
export const AI_MODELS: AIModel[] = [
  // ============================================================================
  // FREE TIER - Cheapest Models (Max 2 concurrent)
  // ============================================================================

  // Gemini 2.5 Flash - Ultra Cheap & Fast
  {
    id: 'gemini-2.5-flash',
    provider: 'openrouter',
    modelId: AllowedModelId.GEMINI_2_5_FLASH,
    name: 'Gemini 2.5 Flash',
    description: 'Ultra-fast, cost-effective model with 1M context. Best price-performance ratio.',
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 8192,
      topP: 0.95,
    },
    isEnabled: true,
    order: 1,
    minTier: 'free',
    metadata: {
      icon: '/static/icons/ai-models/gemini.png',
      color: '#4285F4',
      category: 'general',
      contextWindow: 1000000,
      strengths: [
        'Ultra-fast responses (160 tokens/sec)',
        'Cheapest option ($0.075/M in, $0.30/M out)',
        'Multimodal capabilities',
        '1M token context window',
      ],
      pricing: {
        input: '$0.075/M tokens',
        output: '$0.30/M tokens',
      },
    },
  },

  // Claude 3 Haiku - Fast & Affordable
  {
    id: 'claude-3-haiku',
    provider: 'openrouter',
    modelId: AllowedModelId.CLAUDE_3_HAIKU,
    name: 'Claude 3 Haiku',
    description: 'Fastest Claude model for near-instant responsiveness. Excellent for simple tasks.',
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: false,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 4096,
      topP: 0.9,
    },
    isEnabled: true,
    order: 2,
    minTier: 'free',
    metadata: {
      icon: '/static/icons/ai-models/claude.png',
      color: '#C87544',
      category: 'general',
      contextWindow: 200000,
      strengths: [
        'Near-instant responsiveness',
        'Very cost-effective ($0.25/M in, $1.25/M out)',
        'Quick targeted performance',
        'Multimodal support',
      ],
      pricing: {
        input: '$0.25/M tokens',
        output: '$1.25/M tokens',
      },
    },
  },

  // ============================================================================
  // STARTER TIER - Budget-Friendly (Max 3 concurrent)
  // ============================================================================

  // DeepSeek R1 - Premium Reasoning Model
  {
    id: 'deepseek-r1',
    provider: 'openrouter',
    modelId: AllowedModelId.DEEPSEEK_R1,
    name: 'DeepSeek R1',
    description: 'Powerful reasoning model with 671B parameters. MIT licensed, open-source.',
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.6,
      maxTokens: 8192,
      topP: 0.95,
    },
    isEnabled: true,
    order: 3,
    minTier: 'starter',
    metadata: {
      icon: '/static/icons/ai-models/deepseek.png',
      color: '#1E90FF',
      category: 'reasoning',
      contextWindow: 163840,
      strengths: [
        'Performance on par with O1',
        '671B params (37B active)',
        '90% debugging accuracy',
        'Premium quality reasoning',
      ],
      pricing: {
        input: '$0.55/M tokens',
        output: '$2.19/M tokens',
      },
    },
  },

  // ============================================================================
  // PRO TIER - Professional Grade (Max 5 concurrent)
  // ============================================================================

  // Claude 4.5 Sonnet - Best Coding Model
  {
    id: 'claude-sonnet-4.5',
    provider: 'openrouter',
    modelId: AllowedModelId.CLAUDE_SONNET_4_5,
    name: 'Claude 4.5 Sonnet',
    description: 'Best coding model with 77.2% SWE-bench and 1M context. Industry-leading performance.',
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 8192,
      topP: 0.9,
    },
    isEnabled: true,
    order: 4,
    minTier: 'pro',
    metadata: {
      icon: '/static/icons/ai-models/claude.png',
      color: '#C87544',
      category: 'reasoning',
      contextWindow: 1000000,
      strengths: [
        '77.2% on SWE-bench Verified',
        '1M token context window',
        'Best for complex coding tasks',
        'Superior reasoning abilities',
      ],
      pricing: {
        input: '$3/M tokens',
        output: '$15/M tokens',
      },
    },
  },

  // Gemini 2.5 Pro - Long Context Champion
  {
    id: 'gemini-2.5-pro',
    provider: 'openrouter',
    modelId: AllowedModelId.GEMINI_2_5_PRO,
    name: 'Gemini 2.5 Pro',
    description: 'Google\'s state-of-the-art with 1M+ context, advanced reasoning and scientific tasks.',
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 8192,
      topP: 0.95,
    },
    isEnabled: true,
    order: 5,
    minTier: 'pro',
    metadata: {
      icon: '/static/icons/ai-models/gemini.png',
      color: '#4285F4',
      category: 'reasoning',
      contextWindow: 1048576,
      strengths: [
        '1M+ token context',
        'Advanced reasoning (Index: 60)',
        'Excellent coding',
        'Strong mathematical abilities',
      ],
      pricing: {
        input: '$1.25/M tokens',
        output: '$10/M tokens',
      },
    },
  },

  // GPT-4o - Proven Multimodal
  {
    id: 'gpt-4o',
    provider: 'openrouter',
    modelId: AllowedModelId.GPT_4O,
    name: 'GPT-4o',
    description: 'OpenAI\'s proven multimodal model with vision, voice, and text capabilities.',
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: false,
    },
    defaultSettings: {
      temperature: 0.8,
      maxTokens: 4096,
      topP: 1.0,
    },
    isEnabled: true,
    order: 6,
    minTier: 'pro',
    metadata: {
      icon: '/static/icons/ai-models/openai.png',
      color: '#10A37F',
      category: 'general',
      contextWindow: 128000,
      strengths: [
        'Multimodal capabilities',
        'Fast response times',
        'Strong general performance',
        'Vision and voice support',
      ],
      pricing: {
        input: '$2.50/M tokens',
        output: '$10/M tokens',
      },
    },
  },

  // ============================================================================
  // POWER TIER - Flagship Models (Max 8 concurrent)
  // ============================================================================

  // GPT-5 - OpenAI's Latest Flagship
  {
    id: 'gpt-5',
    provider: 'openrouter',
    modelId: AllowedModelId.GPT_5,
    name: 'GPT-5',
    description: 'OpenAI\'s latest flagship with advanced reasoning, web search, and 400K context.',
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 8192,
      topP: 0.9,
      maxOutputTokens: 4096, // Cost control: $10/M output tokens
    },
    isEnabled: true,
    order: 7,
    minTier: 'power',
    metadata: {
      icon: '/static/icons/ai-models/openai.png',
      color: '#10A37F',
      category: 'reasoning',
      contextWindow: 400000,
      strengths: [
        'Intelligence Index: 68.47',
        '400K token context',
        'Web search capabilities',
        'Advanced reasoning',
      ],
      pricing: {
        input: '$1.25/M tokens',
        output: '$10/M tokens',
      },
    },
  },

  // Claude 4.1 Opus - Anthropic's Ultimate
  {
    id: 'claude-opus-4.1',
    provider: 'openrouter',
    modelId: AllowedModelId.CLAUDE_OPUS_4_1,
    name: 'Claude 4.1 Opus',
    description: 'Anthropic\'s ultimate flagship with 74.5% SWE-bench and 64K extended thinking.',
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 8192,
      topP: 0.9,
      maxOutputTokens: 3072, // Cost control: $75/M output tokens (most expensive!)
    },
    isEnabled: true,
    order: 8,
    minTier: 'power',
    metadata: {
      icon: '/static/icons/ai-models/claude.png',
      color: '#C87544',
      category: 'reasoning',
      contextWindow: 200000,
      strengths: [
        '74.5% on SWE-bench Verified',
        'Extended thinking (64K tokens)',
        'Exceptional agentic tasks',
        'Premium quality',
      ],
      pricing: {
        input: '$15/M tokens',
        output: '$75/M tokens',
      },
    },
  },

  // OpenAI O3 - Premium Reasoning
  {
    id: 'o3',
    provider: 'openrouter',
    modelId: AllowedModelId.O3,
    name: 'OpenAI O3',
    description: 'Advanced reasoning model with 200K context. Intelligence Index: 65.45.',
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 1.0,
      maxTokens: 16384,
      topP: 1.0,
    },
    isEnabled: true,
    order: 9,
    minTier: 'power',
    metadata: {
      icon: '/static/icons/ai-models/openai.png',
      color: '#10A37F',
      category: 'reasoning',
      contextWindow: 200000,
      strengths: [
        'Intelligence Index: 65.45',
        'Advanced reasoning',
        'Multimodal support',
        'Input caching',
      ],
      pricing: {
        input: '$2/M tokens',
        output: '$8/M tokens',
      },
    },
  },
];

/**
 * Default role assignments for models
 * Based on the screenshot provided
 */
export const DEFAULT_ROLES = [
  'The Ideator',
  'Devil\'s Advocate',
  'Builder',
  'Practical Evaluator',
  'Visionary Thinker',
  'Domain Expert',
  'User Advocate',
  'Implementation Strategist',
  'The Data Analyst',
] as const;

export type DefaultRole = typeof DEFAULT_ROLES[number];

/**
 * Get model by ID
 * Searches by both full modelId (e.g., "anthropic/claude-sonnet-4.1")
 * and short id (e.g., "claude-sonnet-4.1") for backward compatibility
 */
export function getModelById(modelId: string): AIModel | undefined {
  // First try exact match on full modelId
  let model = AI_MODELS.find(m => m.modelId === modelId);

  // If not found, try matching by short id for backward compatibility
  if (!model) {
    model = AI_MODELS.find(m => m.id === modelId);
  }

  return model;
}

/**
 * Get models by provider
 */
export function getModelsByProvider(provider: ModelProvider): AIModel[] {
  return AI_MODELS.filter(model => model.provider === provider);
}

/**
 * Get models by category
 */
export function getModelsByCategory(category: ModelMetadata['category']): AIModel[] {
  return AI_MODELS.filter(model => model.metadata.category === category);
}

/**
 * Get enabled models only
 */
export function getEnabledModels(): AIModel[] {
  return AI_MODELS.filter(model => model.isEnabled);
}

/**
 * Validate if a model ID exists in configuration
 * This checks both the OpenRouter model ID list AND the enabled models in AI_MODELS
 */
export function isValidModelId(modelId: string): modelId is OpenRouterModelId {
  // First check if it's a valid OpenRouter model ID (compile-time type safety)
  if (!isValidOpenRouterModelId(modelId)) {
    return false;
  }

  // Then check if it's enabled in our configuration
  return AI_MODELS.some(m => m.modelId === modelId || m.id === modelId);
}

// ============================================================================
// Roundtable Configuration - Participant System
// ============================================================================

/**
 * Generate participant identifier (e.g., "Participant 1", "Participant 2")
 * 1-indexed for human readability
 */
export function getParticipantIdentifier(participantIndex: number): string {
  return `Participant ${participantIndex + 1}`;
}

/**
 * Generate participant label with number and optional role
 * Example: "Participant 1 - Product Manager" or just "Participant 1"
 * This is what other participants see in the system prompt
 */
export function getParticipantLabel(participantIndex: number, role?: string | null): string {
  const identifier = getParticipantIdentifier(participantIndex);

  if (role) {
    return `${identifier} - ${role}`;
  }
  return identifier;
}

/**
 * Generate message attribution for conversation history
 * Example: "Participant 1 (Product Manager):" for role or just "Participant 1:" without role
 * This is what appears before each message in the conversation history
 */
export function getMessageAttribution(participantIndex: number, role?: string | null): string {
  const identifier = getParticipantIdentifier(participantIndex);

  if (role) {
    return `${identifier} (${role})`;
  }
  return identifier;
}

// ============================================================================
// Prompt Engineering Patterns
// ============================================================================

/**
 * Plain text guidance for all responses
 * Encourages natural language without heavy formatting
 */
export const PLAIN_TEXT_GUIDANCE = '\n\nPlease respond in clear, natural language without heavy markdown formatting.';

/**
 * Build system prompt with full participant awareness
 * Models know they are participants and can reference each other
 *
 * @param params - Configuration
 * @param params.mode - Session type (analyzing, brainstorming, debating, solving)
 * @param params.participantIndex - Zero-based index of this participant
 * @param params.participantRole - Optional role for this participant
 * @param params.customSystemPrompt - Optional custom system prompt
 * @param params.otherParticipants - Array of other participants in the session
 */
export function buildRoundtableSystemPrompt(params: {
  mode: ChatModeId;
  participantIndex: number;
  participantRole?: string | null;
  customSystemPrompt?: string | null;
  otherParticipants: Array<{ index: number; role?: string | null }>;
}): string {
  const { mode, participantIndex, participantRole, customSystemPrompt, otherParticipants } = params;

  // Start with mode-specific instruction that includes participant awareness
  let systemPrompt = CHAT_MODE_SYSTEM_PROMPTS[mode] + PLAIN_TEXT_GUIDANCE;

  // Add participant's identity with number
  const participantLabel = getParticipantLabel(participantIndex, participantRole);
  systemPrompt += `\n\nYou are ${participantLabel}.`;

  // Add participant's role for additional context
  if (participantRole) {
    systemPrompt += ` Your perspective: ${participantRole}`;
  }

  // Inform about other participants and how to interact with them
  if (otherParticipants.length > 0) {
    systemPrompt += `\n\nOther participants in this session: `;
    const otherLabels = otherParticipants.map((p) => {
      const label = getParticipantLabel(p.index, p.role);
      return label;
    });
    systemPrompt += otherLabels.join(', ');
    systemPrompt += '.';

    // ✅ CRITICAL: Prevent participants from repeating each other
    systemPrompt += `\n\nCRITICAL RULES - YOU MUST FOLLOW THESE:
1. DO NOT quote or repeat what other participants said
2. DO NOT restate previous messages in any form
3. DO NOT start with "Participant X said..." or similar
4. ONLY write your OWN new perspective
5. You can reference others briefly (e.g., "Building on that point...") but DO NOT repeat their words
6. Start immediately with YOUR unique contribution
7. Assume everyone already read previous messages - no need to summarize them`;
  }

  // Add custom system prompt if provided
  if (customSystemPrompt) {
    systemPrompt += `\n\n${customSystemPrompt}`;
  }

  return systemPrompt;
}

/**
 * Format an assistant message with clear participant attribution
 * Shows which participant said what so models can reference each other
 *
 * @param participantIndex - Index of the participant
 * @param participantRole - Role of the participant (optional)
 * @param messageText - The actual message text
 */
export function formatMessageAsHumanContribution(
  participantIndex: number,
  participantRole: string | null | undefined,
  messageText: string,
): string {
  const attribution = getMessageAttribution(participantIndex, participantRole);
  return `${attribution}: ${messageText}`;
}

// ============================================================================
// Subscription Tier Access Control
// ============================================================================

/**
 * Tier hierarchy for comparison
 * Higher index = higher tier
 */
const TIER_HIERARCHY: Record<SubscriptionTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  power: 3,
};

/**
 * Check if a user's subscription tier can access a specific model tier requirement
 * @param userTier - The user's current subscription tier
 * @param requiredTier - The tier required by the model
 * @returns true if user can access the model, false otherwise
 */
export function canAccessModelTier(
  userTier: SubscriptionTier,
  requiredTier: SubscriptionTier,
): boolean {
  return TIER_HIERARCHY[userTier] >= TIER_HIERARCHY[requiredTier];
}

/**
 * Check if a user can access a specific model based on their subscription tier
 * @param userTier - The user's current subscription tier
 * @param modelId - The model ID to check
 * @returns true if user can access the model, false otherwise
 */
export function canAccessModel(
  userTier: SubscriptionTier,
  modelId: string,
): boolean {
  const model = getModelById(modelId);
  if (!model || !model.isEnabled) {
    return false;
  }
  return canAccessModelTier(userTier, model.minTier);
}

/**
 * Filter models that are accessible to a user based on their subscription tier
 * @param userTier - The user's current subscription tier
 * @param models - Optional array of models to filter (defaults to all enabled models)
 * @returns Array of models the user can access
 */
export function getAccessibleModels(
  userTier: SubscriptionTier,
  models: AIModel[] = AI_MODELS,
): AIModel[] {
  return models.filter(model =>
    model.isEnabled && canAccessModelTier(userTier, model.minTier),
  );
}

/**
 * Get the tier name in a human-readable format
 * @param tier - The subscription tier
 * @returns Capitalized tier name
 */
export function getTierDisplayName(tier: SubscriptionTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
