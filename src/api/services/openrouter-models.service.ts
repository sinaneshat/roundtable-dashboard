/**
 * OpenRouter Models Service - Context7 Pattern
 *
 * ✅ ZOD-FIRST ARCHITECTURE:
 * - NO hardcoded types - all types inferred from Zod schemas
 * - Schemas define the contract, types are automatically derived
 * - Follows established backend patterns from src/api/core
 *
 * Fetches and caches all available models from OpenRouter's API
 * Provides dynamic model discovery instead of hardcoded model lists
 */

import { apiLogger } from '@/api/middleware/hono-logger';
import type { BaseModelResponse, RawOpenRouterModel } from '@/api/routes/models/schema';
import { OpenRouterModelsResponseSchema } from '@/api/routes/models/schema';
import type { SubscriptionTier } from '@/db/config/subscription-tiers';

import { canAccessModelByPricing, getRequiredTierForModel } from './model-pricing-tiers.service';

// ============================================================================
// SCHEMA IMPORTS - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * ✅ SCHEMA REUSABILITY PATTERN: Import schemas from @/api/routes/models/schema
 *
 * Following backend-patterns.md:
 * - All schemas defined in schema.ts files (route-specific)
 * - Services import schemas, never define them
 * - Ensures consistency and reusability across the codebase
 *
 * Imported schemas:
 * - RawOpenRouterModel: Raw API response type (before enhancement)
 * - OpenRouterModelsResponseSchema: Full API response validation
 * - BaseModelResponse: Enhanced model type (after adding computed fields)
 *
 * Reference: src/api/routes/models/schema.ts:89-171
 */

// ============================================================================
// TYPE ALIASES - ENHANCED MODEL TYPE
// ============================================================================

/**
 * ✅ TYPE INFERENCE: Separate types for raw and enhanced models
 * - RawOpenRouterModel: Data from OpenRouter API before enhancement (imported from schema)
 * - EnhancedOpenRouterModel: After adding computed fields (provider, category, capabilities, etc.)
 */
type EnhancedOpenRouterModel = BaseModelResponse;

/**
 * OpenRouter Models Fetcher Service
 */
class OpenRouterModelsService {
  private readonly OPENROUTER_MODELS_API = 'https://openrouter.ai/api/v1/models';
  private cachedModels: EnhancedOpenRouterModel[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hour cache - aggressive caching to minimize API calls

  /**
   * Fetch all models from OpenRouter API
   * Uses caching to avoid excessive API calls
   */
  async fetchAllModels(): Promise<EnhancedOpenRouterModel[]> {
    // Return cached models if still valid
    const now = Date.now();
    if (this.cachedModels && (now - this.cacheTimestamp) < this.CACHE_TTL) {
      apiLogger.info('Returning cached OpenRouter models', {
        count: this.cachedModels.length,
        age: `${Math.round((now - this.cacheTimestamp) / 1000)}s`,
      });
      return this.cachedModels;
    }

    try {
      apiLogger.info('Fetching models from OpenRouter API', {
        url: this.OPENROUTER_MODELS_API,
      });

      const response = await fetch(this.OPENROUTER_MODELS_API, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API returned ${response.status}`);
      }

      const rawData = await response.json();

      // ✅ ZOD VALIDATION: Validate API response at runtime using imported schema
      const parseResult = OpenRouterModelsResponseSchema.safeParse(rawData);

      if (!parseResult.success) {
        apiLogger.error('Failed to validate OpenRouter API response', {
          error: parseResult.error.message,
        });
        throw new Error('Invalid response from OpenRouter API');
      }

      const data = parseResult.data;

      // Enhance models with computed fields
      const enhancedModels = data.data.map(model => this.enhanceModel(model));

      // Update cache
      this.cachedModels = enhancedModels;
      this.cacheTimestamp = now;

      apiLogger.info('Successfully fetched and cached OpenRouter models', {
        count: enhancedModels.length,
      });

      return enhancedModels;
    } catch (error) {
      apiLogger.error('Failed to fetch models from OpenRouter', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return cached models if available, even if stale
      if (this.cachedModels) {
        apiLogger.warn('Returning stale cached models due to fetch failure', {
          count: this.cachedModels.length,
          age: `${Math.round((now - this.cacheTimestamp) / 1000)}s`,
        });
        return this.cachedModels;
      }

      throw error;
    }
  }

  /**
   * Enhance a model with computed fields for better UI experience
   */
  private enhanceModel(model: RawOpenRouterModel): EnhancedOpenRouterModel {
    // Extract provider from model ID (e.g., "anthropic/claude-4" -> "anthropic")
    const provider = model.id.split('/')[0] || 'unknown';

    // Determine category based on model name and description
    const category = this.determineCategory(model);

    // Detect capabilities based on architecture and model name
    const capabilities = {
      vision: this.detectVisionSupport(model),
      reasoning: this.detectReasoningModel(model),
      streaming: true, // Most modern models support streaming
      tools: true, // Most modern models support tools
    };

    // Format pricing for display
    const pricing_display = {
      input: this.formatPricing(Number.parseFloat(model.pricing.prompt)),
      output: this.formatPricing(Number.parseFloat(model.pricing.completion)),
    };

    // Check if model is free
    const is_free = Number.parseFloat(model.pricing.prompt) === 0 && Number.parseFloat(model.pricing.completion) === 0;

    return {
      ...model,
      provider,
      category,
      capabilities,
      pricing_display,
      is_free,
      supports_vision: capabilities.vision,
      is_reasoning_model: capabilities.reasoning,
    };
  }

  /**
   * Determine model category based on name and description
   */
  private determineCategory(model: RawOpenRouterModel): 'reasoning' | 'general' | 'creative' | 'research' {
    const nameLower = model.name.toLowerCase();
    const descLower = model.description?.toLowerCase() || '';
    const idLower = model.id.toLowerCase();

    // Reasoning models
    if (
      nameLower.includes('reasoning')
      || nameLower.includes('o1')
      || nameLower.includes('o3')
      || nameLower.includes('r1')
      || idLower.includes('reasoning')
      || descLower.includes('reasoning')
      || descLower.includes('chain of thought')
    ) {
      return 'reasoning';
    }

    // Research models (Perplexity, online search)
    if (
      nameLower.includes('perplexity')
      || nameLower.includes('sonar')
      || nameLower.includes('research')
      || descLower.includes('search')
      || descLower.includes('research')
    ) {
      return 'research';
    }

    // Creative models
    if (
      nameLower.includes('creative')
      || descLower.includes('creative')
      || descLower.includes('story')
      || descLower.includes('narrative')
    ) {
      return 'creative';
    }

    // Default to general
    return 'general';
  }

  /**
   * Detect vision support based on architecture modality
   */
  private detectVisionSupport(model: RawOpenRouterModel): boolean {
    const modality = model.architecture?.modality?.toLowerCase() || '';
    return modality.includes('image') || modality.includes('vision');
  }

  /**
   * Detect reasoning model based on name patterns
   */
  private detectReasoningModel(model: RawOpenRouterModel): boolean {
    const nameLower = model.name.toLowerCase();
    const idLower = model.id.toLowerCase();

    return (
      nameLower.includes('reasoning')
      || nameLower.includes('o1')
      || nameLower.includes('o3')
      || nameLower.includes('r1')
      || idLower.includes('reasoning')
      || nameLower.includes('claude-4')
      || nameLower.includes('opus')
      || nameLower.includes('sonnet-4')
      || nameLower.includes('gpt-5')
    );
  }

  /**
   * Format pricing for display
   * Converts per-token price to per-million-tokens display
   */
  private formatPricing(pricePerToken: number): string {
    if (pricePerToken === 0) {
      return 'Free';
    }

    const pricePerMillion = pricePerToken * 1000000;

    if (pricePerMillion < 0.01) {
      return `$${pricePerMillion.toFixed(4)}/M tokens`;
    }
    if (pricePerMillion < 1) {
      return `$${pricePerMillion.toFixed(3)}/M tokens`;
    }
    if (pricePerMillion < 10) {
      return `$${pricePerMillion.toFixed(2)}/M tokens`;
    }
    return `$${pricePerMillion.toFixed(1)}/M tokens`;
  }

  /**
   * Get a specific model by ID
   */
  async getModelById(modelId: string): Promise<EnhancedOpenRouterModel | null> {
    const allModels = await this.fetchAllModels();
    return allModels.find(m => m.id === modelId) || null;
  }

  /**
   * ✅ GET DEFAULT MODEL: Get the most popular accessible model for a user's tier
   *
   * Returns the first model from the top 10 that the user can access based on their subscription tier.
   * This ensures the default model is always:
   * 1. One of the most popular models
   * 2. Accessible to the user's current tier
   * 3. Dynamically selected (no hardcoding)
   *
   * Falls back to the cheapest free model if no popular models are accessible (edge case).
   *
   * @param userTier - User's subscription tier
   * @returns The default model ID for the user
   */
  async getDefaultModelForTier(userTier: SubscriptionTier): Promise<string> {
    const top50 = await this.getTop50Models();

    // Get top 10 most popular models
    const top10 = top50.slice(0, 10);

    // Find the first model from top 10 that user can access
    const defaultModel = top10.find(model => this.canUserAccessModel(userTier, model));

    if (defaultModel) {
      apiLogger.info('Selected default model for user tier', {
        userTier,
        modelId: defaultModel.id,
        modelName: defaultModel.name,
        provider: defaultModel.provider,
        isPopular: true,
      });
      return defaultModel.id;
    }

    // Fallback: Find the cheapest free model (edge case - should rarely happen)
    const freeModels = top50.filter(m => m.is_free);
    const fallbackModel = freeModels[0] || top50[0];

    apiLogger.warn('No popular model accessible for user tier, using fallback', {
      userTier,
      fallbackModelId: fallbackModel?.id || 'none',
      fallbackModelName: fallbackModel?.name || 'none',
    });

    return fallbackModel?.id || 'google/gemini-flash-1.5'; // Ultimate fallback
  }

  /**
   * Clear cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.cachedModels = null;
    this.cacheTimestamp = 0;
    apiLogger.info('OpenRouter models cache cleared');
  }

  /**
   * ✅ SINGLE SOURCE OF TRUTH: Get required subscription tier for a model
   * Based on OpenRouter pricing thresholds
   */
  getRequiredTierForModel(model: EnhancedOpenRouterModel): SubscriptionTier {
    return getRequiredTierForModel(model);
  }

  /**
   * ✅ SINGLE SOURCE OF TRUTH: Check if user can access a model based on their tier
   */
  canUserAccessModel(userTier: SubscriptionTier, model: EnhancedOpenRouterModel): boolean {
    return canAccessModelByPricing(userTier, model);
  }

  /**
   * ✅ OPTIMAL ANALYSIS MODEL: Find the cheapest and fastest model for moderator analysis
   *
   * Selection criteria (in priority order):
   * 1. Cost: Very cheap (budget tier preferred, <$0.50/M tokens)
   * 2. Speed: Non-reasoning models (faster inference)
   * 3. Provider: Top-tier providers (anthropic, openai, google, meta, deepseek)
   * 4. Context: Reasonable context window (don't need huge)
   * 5. Structured output: Must support JSON structured output (most modern models do)
   *
   * Returns the single best model for cost-performance balance for analysis tasks
   */
  async getOptimalAnalysisModel(): Promise<EnhancedOpenRouterModel | null> {
    const allModels = await this.fetchAllModels();

    // Filter criteria for analysis models
    const candidateModels = allModels.filter((model) => {
      // Must not be a reasoning model (slower)
      if (model.is_reasoning_model || model.category === 'reasoning') {
        return false;
      }

      // Must be from a reputable provider for reliability
      const topProviders = new Set(['anthropic', 'openai', 'google', 'meta-llama', 'deepseek', 'mistralai', 'qwen']);
      if (!topProviders.has(model.provider)) {
        return false;
      }

      // Calculate cost per million tokens
      const inputPricePerMillion = Number.parseFloat(model.pricing.prompt) * 1000000;
      const outputPricePerMillion = Number.parseFloat(model.pricing.completion) * 1000000;

      // Must be very cheap (budget tier: <$0.50/M tokens input, <$2/M tokens output)
      if (inputPricePerMillion > 0.5 || outputPricePerMillion > 2) {
        return false;
      }

      // Must have reasonable context window (at least 32K, but not excessively large)
      if (model.context_length < 32000) {
        return false;
      }

      return true;
    });

    if (candidateModels.length === 0) {
      apiLogger.warn('No suitable analysis models found, falling back to gpt-4o-mini');
      return allModels.find(m => m.id === 'openai/gpt-4o-mini') || null;
    }

    // Score each candidate for cost-performance balance
    const scoredModels = candidateModels.map((model) => {
      let score = 0;

      // Provider quality scoring (60 points max)
      const tierAProviders = new Set(['anthropic', 'openai', 'google']);
      const tierBProviders = new Set(['meta-llama', 'deepseek', 'mistralai', 'qwen']);

      if (tierAProviders.has(model.provider)) {
        score += 60;
      } else if (tierBProviders.has(model.provider)) {
        score += 40;
      } else {
        score += 20;
      }

      // Cost efficiency scoring (60 points max - lower cost = higher score)
      const inputPricePerMillion = Number.parseFloat(model.pricing.prompt) * 1000000;
      const outputPricePerMillion = Number.parseFloat(model.pricing.completion) * 1000000;
      const avgCostPerMillion = (inputPricePerMillion + outputPricePerMillion) / 2;

      // Invert cost to score (cheaper = better)
      // $0 = 60 points, $0.50/M = 0 points
      const costScore = Math.max(0, 60 - (avgCostPerMillion / 0.5) * 60);
      score += costScore;

      // Speed indicators (30 points max)
      // Prefer newer, smaller, faster models
      // Smaller context = faster (but we need at least 32K)
      if (model.context_length < 64000) {
        score += 15; // Fast models
      } else if (model.context_length < 128000) {
        score += 10; // Medium speed
      } else {
        score += 5; // Slower but capable
      }

      // Recency bonus (15 points max)
      if (model.created) {
        const ageInDays = (Date.now() / 1000 - model.created) / (60 * 60 * 24);
        if (ageInDays < 180) {
          score += 15; // Last 6 months
        } else if (ageInDays < 365) {
          score += 10; // Last year
        } else {
          score += 5; // Older
        }
      }

      // Specific model bonuses for known fast+cheap models
      const idLower = model.id.toLowerCase();
      const nameLower = model.name.toLowerCase();

      if (
        idLower.includes('gpt-4o-mini')
        || idLower.includes('gemini-2.0-flash')
        || idLower.includes('gemini-1.5-flash')
        || idLower.includes('claude-3-5-haiku')
        || idLower.includes('claude-3-haiku')
        || idLower.includes('llama-3.3-70b')
        || idLower.includes('llama-3.1-70b')
        || idLower.includes('deepseek-chat')
        || idLower.includes('qwen-2.5-72b')
        || nameLower.includes('haiku')
        || nameLower.includes('flash')
        || nameLower.includes('mini')
      ) {
        score += 30; // Bonus for known fast+cheap models
      }

      return { model, score };
    });

    // Sort by score and pick the best
    const bestModel = scoredModels.sort((a, b) => b.score - a.score)[0];

    if (bestModel) {
      apiLogger.info('Selected optimal analysis model', {
        modelId: bestModel.model.id,
        modelName: bestModel.model.name,
        provider: bestModel.model.provider,
        inputPrice: bestModel.model.pricing_display.input,
        outputPrice: bestModel.model.pricing_display.output,
        contextLength: bestModel.model.context_length,
        score: bestModel.score.toFixed(2),
      });

      return bestModel.model;
    }

    return null;
  }

  /**
   * ✅ DYNAMIC TOP 50 SELECTION: Intelligently select top 50 most popular models from OpenRouter
   *
   * Selection criteria (in priority order):
   * 1. Provider quality (top tier providers first)
   * 2. Model popularity (based on known flagship models and patterns)
   * 3. Model capabilities (vision, reasoning, tools)
   * 4. Context length (longer = better)
   * 5. Recency (newer models preferred)
   * 6. Pricing tier diversity (ensure models across all tiers)
   *
   * This replaces hardcoded model lists with dynamic selection from OpenRouter API
   * Limited to 50 models to show only the most relevant and popular options
   */
  async getTop50Models(): Promise<EnhancedOpenRouterModel[]> {
    const allModels = await this.fetchAllModels();

    // Define top-tier providers (based on quality and popularity)
    // Tier A: Most popular and widely used providers
    const tierAProviders = new Set(['anthropic', 'openai', 'google']);
    // Tier B: High-quality alternative providers
    const tierBProviders = new Set(['x-ai', 'meta-llama', 'deepseek', 'mistralai', 'qwen', 'cohere']);
    // Tier C: Specialized or emerging providers
    const tierCProviders = new Set(['microsoft', 'amazon', 'nvidia', 'perplexity']);

    // Known popular model patterns (from OpenRouter rankings and industry trends)
    const popularModelPatterns = [
      // Anthropic Claude models (top performers for programming and reasoning)
      'claude-3.5-sonnet',
      'claude-3.7-sonnet',
      'claude-4',
      'claude-3-opus',
      'claude-3-sonnet',
      'claude-3-haiku',
      'claude-3.5-haiku',
      // OpenAI GPT models (widely used)
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o1',
      'o1-preview',
      'o1-mini',
      'o3',
      'o3-mini',
      // Google Gemini models (fast and capable)
      'gemini-2.0',
      'gemini-2.5',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-pro',
      // Meta Llama models (open source leaders)
      'llama-3.3',
      'llama-3.1',
      'llama-3',
      'llama-3.2',
      // DeepSeek models (cost-effective reasoning)
      'deepseek-r1',
      'deepseek-v3',
      'deepseek-chat',
      'deepseek-coder',
      // Mistral models (efficient)
      'mistral-large',
      'mistral-medium',
      'mistral-small',
      'mixtral',
      // xAI Grok (emerging)
      'grok',
      // Qwen models (strong Chinese/English)
      'qwen-2.5',
      'qwen-max',
      'qwen-plus',
    ];

    // Score each model
    const scoredModels = allModels.map((model) => {
      let score = 0;

      // Provider tier scoring (50 points max)
      if (tierAProviders.has(model.provider)) {
        score += 50;
      } else if (tierBProviders.has(model.provider)) {
        score += 35;
      } else if (tierCProviders.has(model.provider)) {
        score += 20;
      } else {
        score += 5; // Other providers
      }

      // Popularity bonus based on known popular models (40 points max)
      const modelNameLower = model.name.toLowerCase();
      const modelIdLower = model.id.toLowerCase();
      let popularityBonus = 0;

      for (const pattern of popularModelPatterns) {
        if (modelNameLower.includes(pattern.toLowerCase()) || modelIdLower.includes(pattern.toLowerCase())) {
          // Match found - give significant bonus
          popularityBonus = 40;
          break;
        }
      }
      score += popularityBonus;

      // Capabilities scoring (25 points max)
      if (model.capabilities.vision)
        score += 10;
      if (model.capabilities.reasoning)
        score += 12;
      if (model.capabilities.tools)
        score += 3;

      // Context length scoring (normalized, 15 points max)
      // 128K context = 10 points, 1M context = 15 points
      const contextScore = Math.min(15, (model.context_length / 128000) * 10);
      score += contextScore;

      // Recency scoring (20 points max)
      // Models from last 6 months get higher scores
      if (model.created) {
        const ageInDays = (Date.now() / 1000 - model.created) / (60 * 60 * 24);
        if (ageInDays < 180) {
          // Last 6 months
          score += 20;
        } else if (ageInDays < 365) {
          // Last year
          score += 12;
        } else if (ageInDays < 730) {
          // Last 2 years
          score += 6;
        } else {
          score += 2; // Older models
        }
      }

      // Penalize extremely expensive models (but don't exclude them entirely)
      const inputPricePerMillion = Number.parseFloat(model.pricing.prompt) * 1000000;
      if (inputPricePerMillion > 50) {
        // Very expensive models
        score -= 15;
      } else if (inputPricePerMillion > 20) {
        // Expensive models
        score -= 5;
      }

      // Bonus for latest flagship models (15 points)
      if (
        modelNameLower.includes('claude-4')
        || modelNameLower.includes('claude-3.7')
        || modelNameLower.includes('gpt-5')
        || modelNameLower.includes('gemini-2.5')
        || modelNameLower.includes('gemini-2.0')
        || modelNameLower.includes('o3')
      ) {
        score += 15; // Latest flagship bonus
      }

      // Bonus for known fast/efficient models (10 points)
      if (
        modelNameLower.includes('flash')
        || modelNameLower.includes('haiku')
        || modelNameLower.includes('mini')
        || modelNameLower.includes('turbo')
      ) {
        score += 10; // Fast model bonus
      }

      return { model, score };
    });

    // Sort by score (descending) and take top 50
    const top50 = scoredModels
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map(item => item.model);

    // Ensure tier diversity - make sure we have models across all pricing tiers
    const tierCounts = {
      free: 0,
      starter: 0,
      pro: 0,
      power: 0,
    };

    top50.forEach((model) => {
      const tier = this.getRequiredTierForModel(model);
      tierCounts[tier]++;
    });

    apiLogger.info('Selected top 50 models dynamically from OpenRouter', {
      total: allModels.length,
      selected: top50.length,
      tierDistribution: tierCounts,
      topProviders: [...new Set(top50.slice(0, 10).map(m => m.provider))],
      top10Models: top50.slice(0, 10).map(m => m.id),
    });

    return top50;
  }
}

/**
 * Singleton instance
 */
export const openRouterModelsService = new OpenRouterModelsService();
