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
  // Anthropic Claude Models
  {
    id: 'claude-sonnet-4.1',
    provider: 'openrouter',
    modelId: 'anthropic/claude-sonnet-4.1',
    name: 'Claude Sonnet 4.5',
    description: 'World\'s best coding model with hybrid reasoning and extended autonomous operation',
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
        '77.2% on SWE-bench Verified',
        'Best at building complex agents',
        'Extended autonomous operation for hours',
        'Parallel tool calls & memory capability',
      ],
      pricing: {
        input: '$3/M tokens',
        output: '$15/M tokens',
      },
    },
  },
  {
    id: 'claude-opus',
    provider: 'openrouter',
    modelId: 'anthropic/claude-opus',
    name: 'Claude Opus 4.1',
    description: 'Most capable Claude with hybrid reasoning for sustained complex tasks and agentic workflows',
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
    order: 2,
    metadata: {
      icon: '/static/icons/ai-models/claude.png',
      color: '#C87544',
      category: 'reasoning',
      contextWindow: 200000,
      strengths: [
        '72.5% on SWE-bench coding tasks',
        '43.2% on Terminal-bench',
        'Sustained performance on long-running tasks',
        'Tool use during extended thinking',
      ],
      pricing: {
        input: '$15/M tokens',
        output: '$75/M tokens',
      },
    },
  },

  // OpenAI GPT Models
  {
    id: 'gpt-5',
    provider: 'openrouter',
    modelId: 'openai/gpt-5',
    name: 'GPT-5',
    description: 'OpenAI\'s flagship reasoning model with state-of-the-art performance across all domains',
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.8,
      maxTokens: 16384,
      topP: 1.0,
    },
    isEnabled: true,
    order: 3,
    metadata: {
      icon: '/static/icons/ai-models/openai.png',
      color: '#10A37F',
      category: 'reasoning',
      contextWindow: 400000,
      strengths: [
        '94.6% on AIME 2025 math',
        '74.9% on SWE-bench Verified',
        '88% on Aider Polyglot coding',
        '45% fewer hallucinations than GPT-4o',
      ],
      pricing: {
        input: 'API pricing varies by tier',
        output: 'API pricing varies by tier',
      },
    },
  },
  {
    id: 'gpt-03',
    provider: 'openrouter',
    modelId: 'openai/gpt-03',
    name: 'GPT-o3',
    description: 'Extended reasoning model optimized for complex problem solving and deep analysis',
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 16384,
      topP: 1.0,
    },
    isEnabled: true,
    order: 4,
    metadata: {
      icon: '/static/icons/ai-models/openai.png',
      color: '#10A37F',
      category: 'reasoning',
      contextWindow: 128000,
      strengths: [
        'Extended reasoning capabilities',
        'Deep problem-solving',
        'Complex analysis tasks',
        'Lower cost than GPT-5',
      ],
    },
  },
  {
    id: 'gpt-40-research',
    provider: 'openrouter',
    modelId: 'openai/gpt-40-research',
    name: 'GPT-4o Research',
    description: 'Multimodal research model optimized for scientific analysis and data synthesis',
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 16384,
      topP: 1.0,
    },
    isEnabled: true,
    order: 5,
    metadata: {
      icon: '/static/icons/ai-models/openai.png',
      color: '#10A37F',
      category: 'research',
      contextWindow: 128000,
      strengths: [
        'Scientific research analysis',
        'Multimodal understanding',
        'Data synthesis',
        'Vision capabilities for research',
      ],
    },
  },

  // Google Gemini
  {
    id: 'gemini-2.5-pro',
    provider: 'openrouter',
    modelId: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Advanced multimodal thinking model with 1M token context for comprehensive analysis',
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
    order: 6,
    metadata: {
      icon: '/static/icons/ai-models/gemini.png',
      color: '#4285F4',
      category: 'general',
      contextWindow: 1000000,
      strengths: [
        '1M token context window',
        '63.8% on SWE-Bench Verified',
        'Leading math & science performance',
        'Native audio output & multimodal',
      ],
    },
  },

  // XAI Grok
  {
    id: 'grok-4',
    provider: 'openrouter',
    modelId: 'xai/grok-4',
    name: 'Grok 4',
    description: 'First-principles reasoning model with real-time search and multimodal capabilities',
    capabilities: {
      streaming: true,
      tools: true,
      vision: true,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.8,
      maxTokens: 8192,
      topP: 0.9,
    },
    isEnabled: true,
    order: 7,
    metadata: {
      icon: '/static/icons/ai-models/xai.png',
      color: '#000000',
      category: 'general',
      contextWindow: 256000,
      strengths: [
        '256K context window (2M in Fast)',
        'Real-time X platform search',
        'Native tool use & code interpreter',
        'Multimodal with vision & audio',
      ],
    },
  },

  // Meta Llama
  {
    id: 'llama-4-maverick',
    provider: 'openrouter',
    modelId: 'meta-llama/llama-4-maverick',
    name: 'Llama 4 Maverick',
    description: 'Open-weight multimodal MoE model beating GPT-4o at fraction of cost',
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 8192,
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
        '17B active / 400B total parameters',
        'Beats GPT-4o & Gemini 2.0 Flash',
        'Multilingual (200 languages)',
        '$0.19/Mtok distributed inference',
      ],
      pricing: {
        input: '$0.19/M tokens',
        output: '$0.19/M tokens',
      },
    },
  },

  // DeepSeek
  {
    id: 'deepseek-r1',
    provider: 'openrouter',
    modelId: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    description: 'Pure RL reasoning model with self-verification and reflection capabilities',
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
      contextWindow: 65536,
      strengths: [
        '79.8% on AIME math competition',
        '97.3% on MATH-500 dataset',
        '2,029 Elo on Codeforces',
        'Self-verification & reflection',
      ],
    },
  },

  // Perplexity Models
  {
    id: 'perplexity-sonar',
    provider: 'openrouter',
    modelId: 'perplexity/sonar',
    name: 'Perplexity Sonar',
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
    },
  },
  {
    id: 'perplexity-sonar-deep',
    provider: 'openrouter',
    modelId: 'perplexity/sonar-deep-research',
    name: 'Perplexity Sonar Deep Research',
    description: 'Autonomous deep research engine conducting exhaustive multi-source analysis in minutes',
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      reasoning: true,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 8192,
      topP: 0.9,
    },
    isEnabled: true,
    order: 11,
    metadata: {
      icon: '/static/icons/ai-models/perplexity.png',
      color: '#20808D',
      category: 'research',
      contextWindow: 127072,
      strengths: [
        '21.1% on Humanity\'s Last Exam',
        '93.9% on SimpleQA benchmark',
        'Searches 100s of sources in <3min',
        'Comprehensive report generation',
      ],
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
 */
export function getModelById(modelId: string): AIModel | undefined {
  return AI_MODELS.find(model => model.modelId === modelId);
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
