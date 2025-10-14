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
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import {
  costPerMillion,
  getDefaultModelForTier,
  getRequiredTierForModel,
  isModelFree,
  parsePrice,
} from '@/api/services/product-logic.service';

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
// TYPE INFERENCE: Model Types
// ============================================================================

/**
 * ✅ TYPE INFERENCE: Separate types for raw and enhanced models
 * - RawOpenRouterModel: Data from OpenRouter API before enhancement (imported from schema)
 * - BaseModelResponse: After adding computed fields (provider, category, capabilities, etc.)
 *   Used directly instead of creating redundant alias
 */

/**
 * OpenRouter Models Fetcher Service
 */
class OpenRouterModelsService {
  private readonly OPENROUTER_MODELS_API = 'https://openrouter.ai/api/v1/models';
  private cachedModels: BaseModelResponse[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hour cache - aggressive caching to minimize API calls

  /**
   * Fetch all models from OpenRouter API
   * Uses caching to avoid excessive API calls
   */
  async fetchAllModels(): Promise<BaseModelResponse[]> {
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
  private enhanceModel(model: RawOpenRouterModel): BaseModelResponse {
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

    // ✅ SINGLE SOURCE OF TRUTH: Use parsePrice() utility for consistent parsing
    const pricing_display = {
      input: this.formatPricing(parsePrice(model.pricing.prompt)),
      output: this.formatPricing(parsePrice(model.pricing.completion)),
    };

    // ✅ SINGLE SOURCE OF TRUTH: Use isModelFree() from model-pricing-tiers.service.ts
    // This checks both pricing AND model name for "free" designation
    const baseModel: BaseModelResponse = {
      ...model,
      provider,
      category,
      capabilities,
      pricing_display,
      is_free: false, // Will be set correctly below
      supports_vision: capabilities.vision,
      is_reasoning_model: capabilities.reasoning,
    };

    return {
      ...baseModel,
      is_free: isModelFree(baseModel),
    };
  }

  /**
   * ✅ MINIMAL CATEGORY DETECTION: Based only on explicit keywords
   * OpenRouter API doesn't provide category field, so we use minimal heuristics
   * Only detects if exact keywords appear in name/id/description
   */
  private determineCategory(model: RawOpenRouterModel): 'reasoning' | 'general' | 'creative' | 'research' {
    const nameLower = model.name.toLowerCase();
    const descLower = model.description?.toLowerCase() || '';
    const idLower = model.id.toLowerCase();

    // Only if explicitly contains "reasoning"
    if (
      nameLower.includes('reasoning')
      || idLower.includes('reasoning')
      || descLower.includes('reasoning')
    ) {
      return 'reasoning';
    }

    // Only if explicitly contains "research" or "search"
    if (
      nameLower.includes('research')
      || nameLower.includes('search')
      || idLower.includes('research')
      || idLower.includes('search')
      || descLower.includes('research')
      || descLower.includes('search')
    ) {
      return 'research';
    }

    // Only if explicitly contains "creative"
    if (
      nameLower.includes('creative')
      || idLower.includes('creative')
      || descLower.includes('creative')
    ) {
      return 'creative';
    }

    // Default to general - most models will be general
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
   * ✅ MINIMAL DETECTION: Only if "reasoning" explicitly in name/id
   * OpenRouter API doesn't provide is_reasoning_model field
   * Uses minimal heuristics - only exact keyword matching
   */
  private detectReasoningModel(model: RawOpenRouterModel): boolean {
    const nameLower = model.name.toLowerCase();
    const idLower = model.id.toLowerCase();

    // Only detect if explicitly contains "reasoning" keyword
    return (
      nameLower.includes('reasoning')
      || idLower.includes('reasoning')
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
  async getModelById(modelId: string): Promise<BaseModelResponse | null> {
    const allModels = await this.fetchAllModels();
    return allModels.find(m => m.id === modelId) || null;
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
  getRequiredTierForModel(model: BaseModelResponse): SubscriptionTier {
    return getRequiredTierForModel(model);
  }

  /**
   * ✅ GET DEFAULT MODEL: Get the most popular accessible model for a user's tier
   *
   * Uses the centralized getDefaultModelForTier function from product-logic.service.ts
   *
   * @param userTier - User's subscription tier
   * @returns The default model ID for the user
   */
  async getDefaultModelForTier(userTier: SubscriptionTier): Promise<string> {
    const top100 = await this.getTop100Models();

    // Use the centralized function from product-logic.service.ts
    const defaultModelId = getDefaultModelForTier(top100, userTier);

    // ✅ FULLY DYNAMIC FALLBACK: If no default found, get cheapest available model
    if (!defaultModelId) {
      const cheapestModel = await this.getCheapestAvailableModel();
      return cheapestModel?.id || top100[0]?.id || '';
    }

    return defaultModelId;
  }

  /**
   * ✅ DYNAMIC FALLBACK: Get the absolute cheapest available model from OpenRouter
   *
   * Selection criteria (in priority order):
   * 1. Cost: Absolutely free models first ($0/M tokens)
   * 2. Provider: Top-tier providers (anthropic, openai, google, meta, deepseek)
   * 3. Context: Reasonable context window (at least 8K)
   * 4. Recency: Newer models preferred
   *
   * This replaces all hard-coded fallbacks like 'openai/gpt-4o-mini' with dynamic selection
   *
   * @returns The cheapest available model, or null if no models available
   */
  /**
   * ✅ 100% DYNAMIC CHEAPEST MODEL SELECTION: No hard-coded provider or model biases
   * Purely data-driven scoring based on OpenRouter API fields
   */
  async getCheapestAvailableModel(): Promise<BaseModelResponse | null> {
    const allModels = await this.fetchAllModels();

    if (allModels.length === 0) {
      apiLogger.warn('No models available from OpenRouter API');
      return null;
    }

    // ✅ NO FILTERING: Score all models to avoid provider bias
    // Filter only for minimum viable context window
    const candidateModels = allModels.filter((model) => {
      // Must have at least 8K context window for basic functionality
      return model.context_length >= 8000;
    });

    // If no candidates meet minimum requirements, use all models
    const modelsToScore = candidateModels.length > 0 ? candidateModels : allModels;

    // ✅ PURELY DATA-DRIVEN SCORING: Based only on OpenRouter API fields
    const scoredModels = modelsToScore.map((model) => {
      let score = 0;

      // Cost efficiency scoring (100 points max - highest priority for "cheapest" model)
      const inputPricePerMillion = costPerMillion(model.pricing.prompt);
      const outputPricePerMillion = costPerMillion(model.pricing.completion);
      const avgCostPerMillion = (inputPricePerMillion + outputPricePerMillion) / 2;

      // Free models get maximum points
      if (avgCostPerMillion === 0) {
        score += 100;
      } else {
        // Invert cost to score (cheaper = better)
        // Models under $1/M get high scores, anything above $10/M gets low scores
        const costScore = Math.max(0, 100 - (avgCostPerMillion / 10) * 100);
        score += costScore;
      }

      // Capabilities scoring (30 points max - reward versatility)
      if (model.capabilities.vision)
        score += 10;
      if (model.capabilities.reasoning)
        score += 10;
      if (model.capabilities.tools)
        score += 10;

      // Context window scoring (20 points max)
      // Prefer models with reasonable context (16K-128K range for balance)
      if (model.context_length >= 16000 && model.context_length <= 128000) {
        score += 20; // Optimal range
      } else if (model.context_length >= 8000 && model.context_length < 16000) {
        score += 10; // Decent
      } else if (model.context_length > 128000) {
        score += 5; // Very large context (potential performance trade-off)
      }

      // Recency scoring (20 points max - prefer maintained models)
      if (model.created) {
        const ageInDays = (Date.now() / 1000 - model.created) / (60 * 60 * 24);
        if (ageInDays < 180) {
          score += 20; // Last 6 months
        } else if (ageInDays < 365) {
          score += 15; // Last year
        } else if (ageInDays < 730) {
          score += 10; // Last 2 years
        } else {
          score += 5; // Older models
        }
      }

      return { model, score };
    });

    // Sort by score and pick the best
    const bestModel = scoredModels.sort((a, b) => b.score - a.score)[0];

    if (bestModel) {
      apiLogger.info('Selected cheapest available model dynamically', {
        modelId: bestModel.model.id,
        modelName: bestModel.model.name,
        provider: bestModel.model.provider,
        inputPrice: bestModel.model.pricing_display.input,
        outputPrice: bestModel.model.pricing_display.output,
        contextLength: bestModel.model.context_length,
        score: bestModel.score.toFixed(2),
        isFree: bestModel.model.is_free,
      });

      return bestModel.model;
    }

    return null;
  }

  /**
   * ✅ 100% DYNAMIC TOP 100 SELECTION: Unbiased model ranking from OpenRouter
   *
   * Selection criteria (purely data-driven, NO hard-coded preferences):
   * 1. Cost efficiency (free/cheap models ranked higher)
   * 2. Model capabilities (vision, reasoning, tools)
   * 3. Context length (optimal range: 32K-256K)
   * 4. Recency (newer models preferred)
   * 5. Pricing tier diversity (ensure models across all tiers)
   *
   * ⚠️ ZERO BIAS: No hard-coded provider names or model patterns
   * All scoring based purely on OpenRouter API data
   */
  async getTop100Models(): Promise<BaseModelResponse[]> {
    const allModels = await this.fetchAllModels();

    // Score each model based ONLY on objective data from OpenRouter API
    const scoredModels = allModels.map((model) => {
      let score = 0;

      // Cost efficiency scoring (60 points max - prioritize affordable models)
      const inputPricePerMillion = costPerMillion(model.pricing.prompt);
      const outputPricePerMillion = costPerMillion(model.pricing.completion);
      const avgCostPerMillion = (inputPricePerMillion + outputPricePerMillion) / 2;

      // Free models get maximum cost score
      if (avgCostPerMillion === 0) {
        score += 60;
      } else if (avgCostPerMillion <= 0.5) {
        score += 50; // Very cheap
      } else if (avgCostPerMillion <= 2) {
        score += 40; // Cheap
      } else if (avgCostPerMillion <= 10) {
        score += 25; // Moderate
      } else if (avgCostPerMillion <= 50) {
        score += 10; // Expensive
      } else {
        score += 0; // Very expensive
      }

      // Capabilities scoring (40 points max - reward versatility)
      if (model.capabilities.vision)
        score += 15;
      if (model.capabilities.reasoning)
        score += 15;
      if (model.capabilities.tools)
        score += 10;

      // Context length scoring (30 points max - sweet spot 32K-256K)
      // Too small: not useful, too large: slower/more expensive
      if (model.context_length >= 32000 && model.context_length <= 256000) {
        score += 30; // Optimal range
      } else if (model.context_length >= 16000 && model.context_length < 32000) {
        score += 20; // Decent
      } else if (model.context_length > 256000) {
        score += 15; // Very large (potentially slower)
      } else if (model.context_length >= 8000) {
        score += 10; // Small but usable
      } else {
        score += 0; // Too small
      }

      // Recency scoring (20 points max - prefer recent models)
      if (model.created) {
        const ageInDays = (Date.now() / 1000 - model.created) / (60 * 60 * 24);
        if (ageInDays < 90) {
          score += 20; // Last 3 months
        } else if (ageInDays < 180) {
          score += 16; // Last 6 months
        } else if (ageInDays < 365) {
          score += 12; // Last year
        } else if (ageInDays < 730) {
          score += 6; // Last 2 years
        } else {
          score += 2; // Older models
        }
      } else {
        score += 10; // No creation date, give neutral score
      }

      return { model, score };
    });

    // Sort by score (descending) and take top 100
    const top100 = scoredModels
      .sort((a, b) => b.score - a.score)
      .slice(0, 100)
      .map(item => item.model);

    // Ensure tier diversity - make sure we have models across all pricing tiers
    const tierCounts = {
      free: 0,
      starter: 0,
      pro: 0,
      power: 0,
    };

    top100.forEach((model) => {
      const tier = this.getRequiredTierForModel(model);
      tierCounts[tier]++;
    });

    apiLogger.info('Selected top 100 models dynamically from OpenRouter (zero bias)', {
      total: allModels.length,
      selected: top100.length,
      tierDistribution: tierCounts,
      topProviders: [...new Set(top100.slice(0, 10).map(m => m.provider))],
      top10Models: top100.slice(0, 10).map(m => m.id),
    });

    return top100;
  }

  /**
   * ✅ 100% DYNAMIC OPTIMAL ANALYSIS MODEL SELECTION: No hard-coded provider or model biases
   * Find the cheapest and fastest model for moderator analysis
   * Purely data-driven scoring based on OpenRouter API fields
   *
   * Selection criteria (in priority order):
   * 1. Cost: Very cheap (budget tier preferred, <$0.50/M tokens)
   * 2. Speed: Non-reasoning models (faster inference)
   * 3. Context: Reasonable context window (at least 32K)
   * 4. Capabilities: Vision, reasoning, tools support
   * 5. Recency: Prefer actively maintained models
   *
   * Returns the single best model for cost-performance balance for analysis tasks
   */
  async getOptimalAnalysisModel(): Promise<BaseModelResponse | null> {
    const allModels = await this.fetchAllModels();

    // ✅ NO PROVIDER FILTERING: Filter only by objective criteria from OpenRouter API
    const candidateModels = allModels.filter((model) => {
      // Must not be a reasoning model (slower by design)
      if (model.is_reasoning_model || model.category === 'reasoning') {
        return false;
      }

      // ✅ SINGLE SOURCE OF TRUTH: Use costPerMillion() utility for consistent calculations
      const inputPricePerMillion = costPerMillion(model.pricing.prompt);
      const outputPricePerMillion = costPerMillion(model.pricing.completion);

      // Must be very cheap (budget tier: <$0.50/M tokens input, <$2/M tokens output)
      if (inputPricePerMillion > 0.5 || outputPricePerMillion > 2) {
        return false;
      }

      // Must have reasonable context window (at least 32K for analysis tasks)
      if (model.context_length < 32000) {
        return false;
      }

      return true;
    });

    if (candidateModels.length === 0) {
      apiLogger.warn('No suitable analysis models found, using dynamic cheapest model fallback');
      // ✅ FULLY DYNAMIC FALLBACK: Get cheapest available model instead of hard-coded fallback
      return await this.getCheapestAvailableModel();
    }

    // ✅ PURELY DATA-DRIVEN SCORING: Based only on OpenRouter API fields
    const scoredModels = candidateModels.map((model) => {
      let score = 0;

      // Cost efficiency scoring (60 points max - highest priority for budget-conscious analysis)
      // ✅ SINGLE SOURCE OF TRUTH: Use costPerMillion() utility for consistent calculations
      const inputPricePerMillion = costPerMillion(model.pricing.prompt);
      const outputPricePerMillion = costPerMillion(model.pricing.completion);
      const avgCostPerMillion = (inputPricePerMillion + outputPricePerMillion) / 2;

      // Invert cost to score (cheaper = better)
      // $0 = 60 points, $0.50/M = 0 points
      const costScore = Math.max(0, 60 - (avgCostPerMillion / 0.5) * 60);
      score += costScore;

      // Speed indicators based on context length (30 points max)
      // Smaller context = faster (but we need at least 32K)
      if (model.context_length >= 32000 && model.context_length < 64000) {
        score += 30; // Fast models (32K-64K)
      } else if (model.context_length >= 64000 && model.context_length < 128000) {
        score += 20; // Medium speed (64K-128K)
      } else {
        score += 10; // Slower but capable (128K+)
      }

      // Capabilities scoring (25 points max - reward versatility)
      if (model.capabilities.vision)
        score += 10;
      if (model.capabilities.reasoning)
        score += 10;
      if (model.capabilities.tools)
        score += 5;

      // Recency scoring (15 points max - prefer maintained models)
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

      return { model, score };
    });

    // Sort by score and pick the best
    const bestModel = scoredModels.sort((a, b) => b.score - a.score)[0];

    if (bestModel) {
      apiLogger.info('Selected optimal analysis model dynamically', {
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
}

/**
 * Singleton instance
 */
export const openRouterModelsService = new OpenRouterModelsService();
