/**
 * AI Model Configurations
 * Supported models for multi-model chat orchestration
 */

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
  modelId: string;
  name: string;
  description: string;
  capabilities: ModelCapabilities;
  defaultSettings: ModelDefaultSettings;
  isEnabled: boolean;
  order: number;
  metadata: ModelMetadata;
};

/**
 * Supported AI Models Configuration
 * All models accessible via OpenRouter
 */
export const AI_MODELS: AIModel[] = [
  // Anthropic Claude Models (Real OpenRouter model IDs)
  {
    id: 'claude-3.5-sonnet',
    provider: 'openrouter',
    modelId: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    description: 'Most intelligent Claude model with best-in-class coding, vision, and reasoning',
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
    order: 1,
    metadata: {
      icon: '/static/icons/ai-models/claude.png',
      color: '#C87544',
      category: 'reasoning',
      contextWindow: 200000,
      strengths: [
        'Best-in-class coding performance',
        'Advanced vision capabilities',
        'Superior reasoning abilities',
        'Tool use and function calling',
      ],
      pricing: {
        input: '$3/M tokens',
        output: '$15/M tokens',
      },
    },
  },
  {
    id: 'claude-3-opus',
    provider: 'openrouter',
    modelId: 'anthropic/claude-3-opus',
    name: 'Claude 3 Opus',
    description: 'Most capable Claude model for complex tasks requiring deep understanding',
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 4096,
      topP: 0.9,
    },
    isEnabled: true,
    order: 2,
    metadata: {
      icon: '/static/icons/ai-models/claude.png',
      color: '#C87544',
      category: 'reasoning',
      contextWindow: 200000,
      strengths: [
        'Exceptional complex task handling',
        'Multimodal understanding',
        'Sustained performance on long tasks',
        'Tool use during extended thinking',
      ],
      pricing: {
        input: '$15/M tokens',
        output: '$75/M tokens',
      },
    },
  },
  {
    id: 'claude-3-haiku',
    provider: 'openrouter',
    modelId: 'anthropic/claude-3-haiku',
    name: 'Claude 3 Haiku',
    description: 'Fastest Claude model for near-instant responsiveness and cost efficiency',
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
    order: 3,
    metadata: {
      icon: '/static/icons/ai-models/claude.png',
      color: '#C87544',
      category: 'general',
      contextWindow: 200000,
      strengths: [
        'Near-instant responsiveness',
        'Cost-effective',
        'Quick targeted performance',
        'Multimodal support',
      ],
      pricing: {
        input: '$0.25/M tokens',
        output: '$1.25/M tokens',
      },
    },
  },

  // OpenAI GPT Models (Real OpenRouter model IDs)
  {
    id: 'gpt-4o',
    provider: 'openrouter',
    modelId: 'openai/gpt-4o',
    name: 'GPT-4o',
    description: 'OpenAI\'s most advanced multimodal model with vision, voice, and text capabilities',
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
    order: 4,
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
  {
    id: 'gpt-4-turbo',
    provider: 'openrouter',
    modelId: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    description: 'Powerful GPT-4 variant optimized for speed and longer context',
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: false,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 4096,
      topP: 1.0,
    },
    isEnabled: true,
    order: 5,
    metadata: {
      icon: '/static/icons/ai-models/openai.png',
      color: '#10A37F',
      category: 'reasoning',
      contextWindow: 128000,
      strengths: [
        'Enhanced reasoning',
        'Larger context window',
        'Vision capabilities',
        'Tool calling support',
      ],
      pricing: {
        input: '$10/M tokens',
        output: '$30/M tokens',
      },
    },
  },
  {
    id: 'o1-mini',
    provider: 'openrouter',
    modelId: 'openai/o1-mini',
    name: 'OpenAI o1-mini',
    description: 'Fast reasoning model optimized for coding and STEM tasks',
    capabilities: {
      streaming: true,
      tools: false,
      vision: false,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 1.0,
      maxTokens: 65536,
      topP: 1.0,
    },
    isEnabled: true,
    order: 6,
    metadata: {
      icon: '/static/icons/ai-models/openai.png',
      color: '#10A37F',
      category: 'reasoning',
      contextWindow: 128000,
      strengths: [
        'Extended reasoning for coding',
        'STEM problem solving',
        'Cost-effective reasoning',
        'Fast inference',
      ],
      pricing: {
        input: '$3/M tokens',
        output: '$12/M tokens',
      },
    },
  },

  // Google Gemini (Real OpenRouter model IDs)
  {
    id: 'gemini-pro-1.5',
    provider: 'openrouter',
    modelId: 'google/gemini-1.5-pro',
    name: 'Gemini 1.5 Pro',
    description: 'Advanced Google model with massive 2M token context window',
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.9,
      maxTokens: 8192,
      topP: 0.95,
    },
    isEnabled: true,
    order: 7,
    metadata: {
      icon: '/static/icons/ai-models/gemini.png',
      color: '#4285F4',
      category: 'general',
      contextWindow: 2000000,
      strengths: [
        '2M token context window',
        'Multimodal capabilities',
        'Native tool use',
        'Strong general performance',
      ],
      pricing: {
        input: '$1.25/M tokens',
        output: '$5/M tokens',
      },
    },
  },

  // Meta Llama (Real OpenRouter model IDs)
  {
    id: 'llama-3.1-405b',
    provider: 'openrouter',
    modelId: 'meta-llama/llama-3.1-405b-instruct',
    name: 'Llama 3.1 405B',
    description: 'Meta\'s largest open-weight model with exceptional capabilities',
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 4096,
      topP: 0.9,
    },
    isEnabled: true,
    order: 8,
    metadata: {
      icon: '/static/icons/ai-models/meta.png',
      color: '#0081FB',
      category: 'reasoning',
      contextWindow: 128000,
      strengths: [
        'Open-weight model',
        'Competitive with proprietary models',
        'Strong tool use',
        'Multilingual support',
      ],
      pricing: {
        input: '$2.70/M tokens',
        output: '$2.70/M tokens',
      },
    },
  },

  // DeepSeek (Real OpenRouter model IDs)
  {
    id: 'deepseek-chat',
    provider: 'openrouter',
    modelId: 'deepseek/deepseek-chat',
    name: 'DeepSeek Chat',
    description: 'Cost-effective reasoning model with strong coding capabilities',
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
    order: 9,
    metadata: {
      icon: '/static/icons/ai-models/deepseek.png',
      color: '#1E90FF',
      category: 'reasoning',
      contextWindow: 64000,
      strengths: [
        'Cost-effective',
        'Strong coding abilities',
        'Reasoning capabilities',
        'Efficient inference',
      ],
      pricing: {
        input: '$0.14/M tokens',
        output: '$0.28/M tokens',
      },
    },
  },

  // Perplexity Models (Real OpenRouter model IDs)
  {
    id: 'perplexity-sonar-large',
    provider: 'openrouter',
    modelId: 'perplexity/llama-3.1-sonar-large-128k-online',
    name: 'Perplexity Sonar Large',
    description: 'Fast real-time search model with AI-driven insights and web access',
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 4096,
      topP: 0.9,
    },
    isEnabled: true,
    order: 10,
    metadata: {
      icon: '/static/icons/ai-models/perplexity.png',
      color: '#20808D',
      category: 'research',
      contextWindow: 127072,
      strengths: [
        'Real-time web search',
        'Fast response times',
        'AI-driven insights',
        'Cost-effective research',
      ],
      pricing: {
        input: '$1/M tokens',
        output: '$1/M tokens',
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
 * Type-safe model ID
 * Derived from AI_MODELS configuration to ensure only valid model IDs are used
 */
export type ValidModelId = typeof AI_MODELS[number]['modelId'];

/**
 * Type-safe model short ID
 * Derived from AI_MODELS configuration
 */
export type ValidModelShortId = typeof AI_MODELS[number]['id'];

/**
 * Validate if a model ID exists in configuration
 */
export function isValidModelId(modelId: string): modelId is ValidModelId {
  return AI_MODELS.some(m => m.modelId === modelId || m.id === modelId);
}
