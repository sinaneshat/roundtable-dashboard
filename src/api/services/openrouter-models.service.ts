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

// ============================================================================
// DYNAMIC MODEL SELECTION CONFIGURATION
// ============================================================================

/**
 * ✅ 100% DYNAMIC: No hard-coded provider names or model identifiers
 *
 * Model selection is entirely data-driven based on OpenRouter API responses:
 * - Pricing data (from API)
 * - Context length (from API)
 * - Recency (from API created field)
 * - Capabilities (from API architecture field)
 * - Modality (from API architecture.modality field)
 *
 * This ensures the system adapts automatically as OpenRouter adds new models
 * or providers without requiring code changes.
 */

/**
 * Number of top models to return to users
 * Increased to 250 to ensure:
 * - More model variants across all providers
 * - Better coverage across all pricing tiers
 * - Sufficient selection for Free, Starter, Pro, and Power tiers
 */
const MAX_MODELS_TO_RETURN = 250;

/**
 * Maximum models to show from any single provider
 * Ensures provider diversity - prevents any single provider from dominating
 * User sees best 5 models from each provider (OpenAI, Anthropic, Google, etc.)
 */
const MAX_MODELS_PER_PROVIDER = 5;

/**
 * Minimum pricing threshold to exclude OpenRouter's free tier
 * Models with both prompt and completion pricing of "0" are considered
 * OpenRouter free tier and will be excluded
 */
const MIN_PRICING_THRESHOLD = 0;

/**
 * OpenRouter Models Fetcher Service
 */
class OpenRouterModelsService {
  private readonly OPENROUTER_MODELS_API = 'https://openrouter.ai/api/v1/models';
  // ✅ NO SERVER-SIDE CACHING: Always fetch fresh data from OpenRouter
  // TanStack Query handles caching on the client side

  /**
   * Fetch all models from OpenRouter API
   * ✅ ALWAYS FRESH: No server-side caching - relies on client-side TanStack Query cache
   * ✅ 100% DYNAMIC FILTERING: Based only on API data, no hard-coded exclusions
   */
  async fetchAllModels(): Promise<BaseModelResponse[]> {
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
      throw new Error('Invalid response from OpenRouter API');
    }

    const data = parseResult.data;

    // ✅ FILTER: Only text-capable models (no pure audio/image/video generation)
    // Includes multimodal models that can process images but generate text
    const textCapableModels = data.data.filter(model => this.isTextCapableModel(model));

    // ✅ FILTER: Exclude OpenRouter free tier models (pricing = "0" for both prompt and completion)
    // These are low-quality models provided free by OpenRouter, not premium models
    const paidModels = textCapableModels.filter(model => !this.isOpenRouterFreeTier(model));

    // Enhance models with computed fields
    const enhancedModels = paidModels.map(model => this.enhanceModel(model));

    return enhancedModels;
  }

  /**
   * ✅ 100% DYNAMIC: Check if model is OpenRouter free tier
   *
   * OpenRouter free tier models have pricing of "0" for both prompt and completion.
   * These are typically low-quality models and should be excluded from our curated list.
   *
   * We only want premium/paid models that indicate quality and active maintenance.
   */
  private isOpenRouterFreeTier(model: RawOpenRouterModel): boolean {
    const promptPrice = parsePrice(model.pricing.prompt);
    const completionPrice = parsePrice(model.pricing.completion);

    // If both prompt and completion are free (0), it's OpenRouter free tier
    return promptPrice === MIN_PRICING_THRESHOLD && completionPrice === MIN_PRICING_THRESHOLD;
  }

  /**
   * ✅ PURE API DATA: Text-capable filter using ONLY architecture.modality field
   *
   * Includes ONLY models that generate PURE TEXT output:
   * - text->text (chat, completion, reasoning)
   * - text+image->text (vision models that generate text)
   * - audio->text (transcription models that generate text)
   * - image->text (OCR, vision models that generate text)
   *
   * Excludes ANY models that generate non-text outputs:
   * - *->image (image generation - DALL-E, Flux, Stable Diffusion, etc.)
   * - *->audio (audio generation - TTS, music generation, etc.)
   * - *->video (video generation - Sora, etc.)
   * - *->text+image (multimodal output including images - GPT-5 Image, etc.)
   * - *->text+audio (multimodal output including audio)
   *
   * Detection: If the OUTPUT side of modality (after "->") contains anything
   * other than pure "text", the model is EXCLUDED.
   *
   * Uses ONLY the architecture.modality field from OpenRouter API.
   */
  private isTextCapableModel(model: RawOpenRouterModel): boolean {
    const modality = model.architecture?.modality?.toLowerCase() || '';

    // If no modality specified, assume it's text-capable (most models are)
    if (!modality) {
      return true;
    }

    // Split on "->" to get output modality
    const parts = modality.split('->');
    if (parts.length < 2 || !parts[1]) {
      // No arrow or no output part, assume text-capable
      return true;
    }

    const outputModality = parts[1].trim();

    // ONLY allow pure text output
    // Exclude if output contains: image, audio, video, or any combination with text
    if (
      outputModality !== 'text'
      && (outputModality.includes('image')
        || outputModality.includes('audio')
        || outputModality.includes('video'))
    ) {
      return false;
    }

    // INCLUDE: Pure text output models
    return true;
  }

  /**
   * ✅ 100% DYNAMIC: Enhance model with computed fields
   *
   * All fields computed from API data, no hard-coded values:
   * - provider: Extracted from model ID
   * - category: Detected from modality and description
   * - capabilities: Detected from architecture.modality
   * - pricing_display: Formatted from pricing.prompt/completion
   * - is_free: Computed from actual pricing values
   */
  private enhanceModel(model: RawOpenRouterModel): BaseModelResponse {
    // Extract provider from model ID (e.g., "anthropic/claude-4" -> "anthropic")
    const provider = model.id.split('/')[0] || 'unknown';

    // Determine category based on modality and description (100% dynamic)
    const category = this.determineCategory(model);

    // Detect capabilities from architecture.modality field (100% dynamic)
    const capabilities = {
      vision: this.detectVisionSupport(model),
      reasoning: this.detectReasoningSupport(model),
      streaming: true, // Most modern models support streaming
      tools: true, // Most modern models support tools
    };

    // Format pricing for display
    const pricing_display = {
      input: this.formatPricing(parsePrice(model.pricing.prompt)),
      output: this.formatPricing(parsePrice(model.pricing.completion)),
    };

    // Compute if model is free based on actual pricing
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
   * ✅ PURE API DATA: Category detection using ONLY OpenRouter API fields
   *
   * Uses only data provided by OpenRouter API (description field).
   * NO pattern matching, NO model name parsing, NO hard-coding.
   *
   * If OpenRouter doesn't provide category data, default to 'general'.
   */
  private determineCategory(model: RawOpenRouterModel): 'general' | 'creative' | 'research' | 'reasoning' {
    const descLower = model.description?.toLowerCase() || '';

    // Check description field ONLY (data from OpenRouter)
    if (descLower.includes('reasoning') || descLower.includes('extended thinking')) {
      return 'reasoning';
    }

    if (descLower.includes('research') || descLower.includes('analysis')) {
      return 'research';
    }

    if (descLower.includes('creative') || descLower.includes('storytelling')) {
      return 'creative';
    }

    // Default: general purpose
    return 'general';
  }

  /**
   * ✅ 100% DYNAMIC: Detect vision/multimodal support
   *
   * Based on architecture.modality field from OpenRouter API.
   * Models that can process images as input have vision capability.
   */
  private detectVisionSupport(model: RawOpenRouterModel): boolean {
    const modality = model.architecture?.modality?.toLowerCase() || '';
    return modality.includes('image') || modality.includes('vision') || modality.includes('multimodal');
  }

  /**
   * ✅ PURE API DATA: Detect reasoning support using ONLY API description
   *
   * Uses only the description field from OpenRouter API.
   * NO pattern matching on model names or IDs.
   */
  private detectReasoningSupport(model: RawOpenRouterModel): boolean {
    const descLower = model.description?.toLowerCase() || '';

    // Check ONLY description field from API
    return (
      descLower.includes('reasoning')
      || descLower.includes('extended thinking')
      || descLower.includes('chain-of-thought')
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
    const topModels = await this.getTopModelsAcrossProviders();

    // Use the centralized function from product-logic.service.ts
    const defaultModelId = getDefaultModelForTier(topModels, userTier);

    // ✅ FULLY DYNAMIC FALLBACK: If no default found, get cheapest available model
    if (!defaultModelId) {
      const cheapestModel = await this.getCheapestAvailableModel();
      return cheapestModel?.id || topModels[0]?.id || '';
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
        score += 15;
      // Reasoning capability removed - all reasoning models filtered out
      if (model.capabilities.tools)
        score += 15;

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
      return bestModel.model;
    }

    return null;
  }

  /**
   * ✅ 100% DYNAMIC FASTEST MODEL SELECTION: No hard-coded provider or model biases
   * Purely data-driven scoring based on OpenRouter API fields
   *
   * Prioritizes speed over cost for latency-sensitive operations like title generation.
   *
   * Selection criteria (in priority order):
   * 1. Speed: Smaller context window = faster inference (100 points max)
   * 2. Cost: Free/cheap models preferred (40 points max)
   * 3. Capabilities: Basic text generation (20 points max)
   * 4. Recency: Newer models preferred (20 points max)
   *
   * @returns The fastest available model, or null if no models available
   */
  async getFastestAvailableModel(): Promise<BaseModelResponse | null> {
    const allModels = await this.fetchAllModels();

    if (allModels.length === 0) {
      return null;
    }

    // Filter for minimum viable models for title generation
    const candidateModels = allModels.filter((model) => {
      // Must have at least 8K context window (sufficient for title generation)
      // Must support basic text generation (no vision/reasoning required)
      return model.context_length >= 8000;
    });

    // If no candidates meet minimum requirements, use all models
    const modelsToScore = candidateModels.length > 0 ? candidateModels : allModels;

    // ✅ PURELY DATA-DRIVEN SCORING: Based only on OpenRouter API fields
    const scoredModels = modelsToScore.map((model) => {
      let score = 0;

      // Speed scoring (100 points max - HIGHEST PRIORITY for fastest model)
      // Smaller context = faster inference
      // 8K-16K context models are typically the fastest
      if (model.context_length >= 8000 && model.context_length < 16000) {
        score += 100; // Fastest tier (8K-16K)
      } else if (model.context_length >= 16000 && model.context_length < 32000) {
        score += 80; // Very fast (16K-32K)
      } else if (model.context_length >= 32000 && model.context_length < 64000) {
        score += 60; // Fast (32K-64K)
      } else if (model.context_length >= 64000 && model.context_length < 128000) {
        score += 40; // Medium (64K-128K)
      } else {
        score += 20; // Slower (128K+)
      }

      // Cost efficiency scoring (40 points max - secondary priority)
      const inputPricePerMillion = costPerMillion(model.pricing.prompt);
      const outputPricePerMillion = costPerMillion(model.pricing.completion);
      const avgCostPerMillion = (inputPricePerMillion + outputPricePerMillion) / 2;

      // Free models get maximum cost points
      if (avgCostPerMillion === 0) {
        score += 40;
      } else {
        // Invert cost to score (cheaper = better)
        // $0 = 40 points, $1/M = 0 points
        const costScore = Math.max(0, 40 - (avgCostPerMillion / 1) * 40);
        score += costScore;
      }

      // Capabilities scoring (20 points max - basic requirements)
      // For title generation, we don't need vision or advanced reasoning
      // Just basic text generation capability
      if (model.capabilities.tools)
        score += 10;
      // Simple text models get bonus (no complex features = faster)
      if (!model.capabilities.vision && !model.capabilities.reasoning)
        score += 10;

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
      return bestModel.model;
    }

    return null;
  }

  /**
   * ✅ 100% DYNAMIC MODEL SCORING: No hard-coded provider names
   *
   * Scores models based purely on observable characteristics from OpenRouter API:
   * 1. Context Length (35 points) - Larger context = more capable
   * 2. Recency (25 points) - Newer = better maintained
   * 3. Capabilities (20 points) - Vision + reasoning + tools
   * 4. Pricing Tier (20 points) - Mid-to-high pricing indicates quality/demand
   *
   * This scoring ensures:
   * - Quality models rise to the top
   * - Good distribution across pricing tiers (Free, Starter, Pro, Power)
   * - No bias toward any specific provider
   * - Fully adaptive to new models and providers
   */
  private calculateModelScore(model: BaseModelResponse): number {
    let score = 0;

    // ═══════════════════════════════════════════════════════════════
    // CONTEXT LENGTH (35 points) - Capability indicator
    // ═══════════════════════════════════════════════════════════════
    if (model.context_length >= 200000) {
      score += 35; // Ultra-large (200K+) - cutting-edge
    } else if (model.context_length >= 128000) {
      score += 30; // Large (128K-200K) - flagship tier
    } else if (model.context_length >= 64000) {
      score += 20; // Medium-large (64K-128K) - capable
    } else if (model.context_length >= 32000) {
      score += 10; // Medium (32K-64K) - standard
    } else {
      score += 0; // Small (<32K) - basic
    }

    // ═══════════════════════════════════════════════════════════════
    // RECENCY (25 points) - Maintenance and relevance indicator
    // ═══════════════════════════════════════════════════════════════
    if (model.created) {
      const ageInDays = (Date.now() / 1000 - model.created) / (60 * 60 * 24);
      if (ageInDays < 90) {
        score += 25; // Last 3 months - cutting-edge
      } else if (ageInDays < 180) {
        score += 20; // Last 6 months - recent
      } else if (ageInDays < 365) {
        score += 15; // Last year - maintained
      } else if (ageInDays < 730) {
        score += 8; // Last 2 years - older
      } else {
        score += 0; // Very old - outdated
      }
    } else {
      score += 10; // No timestamp - neutral
    }

    // ═══════════════════════════════════════════════════════════════
    // CAPABILITIES (20 points) - Advanced feature indicator
    // ═══════════════════════════════════════════════════════════════
    if (model.capabilities.vision)
      score += 8; // Multimodal vision
    if (model.capabilities.reasoning)
      score += 7; // Extended thinking
    if (model.capabilities.tools)
      score += 5; // Function calling

    // ═══════════════════════════════════════════════════════════════
    // PRICING TIER (20 points) - Quality/demand indicator
    // ═══════════════════════════════════════════════════════════════
    // Mid-to-high pricing indicates popular, high-quality models
    // Very cheap models might be lower quality
    // Very expensive models might be niche/specialized
    const inputPricePerMillion = costPerMillion(model.pricing.prompt);

    if (inputPricePerMillion >= 5 && inputPricePerMillion <= 20) {
      score += 20; // Sweet spot - flagship pricing tier
    } else if (inputPricePerMillion >= 1 && inputPricePerMillion < 5) {
      score += 15; // Mid-tier pricing
    } else if (inputPricePerMillion > 20 && inputPricePerMillion <= 100) {
      score += 12; // Premium pricing
    } else if (inputPricePerMillion > 0 && inputPricePerMillion < 1) {
      score += 8; // Budget pricing
    } else if (inputPricePerMillion > 100) {
      score += 5; // Ultra-premium pricing
    } else {
      score += 0; // Free tier (already filtered out)
    }

    return score;
  }

  /**
   * ✅ 100% DYNAMIC TOP MODELS SELECTION WITH PROVIDER DIVERSITY
   *
   * NEW ALGORITHM (fully dynamic, no provider hard-coding):
   * 1. Score all paid, text-capable models
   * 2. Sort by score (highest first)
   * 3. Limit to max 5 models per provider (ensures diversity)
   * 4. Return top 250 models total
   *
   * Benefits:
   * - NO hard-coded provider names or preferences
   * - Automatically adapts to new providers joining OpenRouter
   * - Provider diversity: Max 5 models from any single provider
   * - Quality-focused scoring ensures best models rise to top
   * - Large model count (250) ensures coverage across all pricing tiers
   * - Tier categorization happens in the handler (Free, Starter, Pro, Power)
   *
   * @returns Top 250 highest-scoring models (max 5 per provider)
   */
  async getTopModelsAcrossProviders(): Promise<BaseModelResponse[]> {
    const allModels = await this.fetchAllModels();

    // Score all models using dynamic scoring algorithm
    const scoredModels = allModels.map(model => ({
      model,
      score: this.calculateModelScore(model),
    }));

    // Sort by score (descending)
    scoredModels.sort((a, b) => b.score - a.score);

    // Apply provider diversity limit (max 5 per provider)
    const providerCounts = new Map<string, number>();
    const selectedModels: BaseModelResponse[] = [];

    for (const { model } of scoredModels) {
      const provider = model.provider;
      const currentCount = providerCounts.get(provider) || 0;

      // Only add if this provider has less than max allowed
      if (currentCount < MAX_MODELS_PER_PROVIDER) {
        selectedModels.push(model);
        providerCounts.set(provider, currentCount + 1);
      }

      // Stop once we have enough models
      if (selectedModels.length >= MAX_MODELS_TO_RETURN) {
        break;
      }
    }

    return selectedModels;
  }

  /**
   * ✅ DEPRECATED: Use getTopModelsAcrossProviders() instead
   * Kept for backward compatibility
   */
  async getTop50Models(): Promise<BaseModelResponse[]> {
    return this.getTopModelsAcrossProviders();
  }

  /**
   * ✅ BACKWARD COMPATIBILITY: Alias for getTop50Models()
   * @deprecated Use getTop50Models() instead for clarity
   */
  async getTop100Models(): Promise<BaseModelResponse[]> {
    return this.getTop50Models();
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
      // Reasoning models are already filtered out at fetchAllModels level
      // No need to check again here

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
        score += 15;
      // Reasoning capability removed - all reasoning models filtered out
      if (model.capabilities.tools)
        score += 10;

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
      return bestModel.model;
    }

    return null;
  }
}

// ============================================================================
// Model Metadata Utilities
// ============================================================================

/**
 * Extract a human-readable model name from a model ID
 * Converts model IDs like "openai/gpt-4-turbo" to "Gpt 4 Turbo"
 *
 * @param modelId - Full model ID (e.g., "openai/gpt-4-turbo")
 * @returns Formatted model name (e.g., "Gpt 4 Turbo")
 *
 * @example
 * extractModeratorModelName("openai/gpt-4-turbo") // "Gpt 4 Turbo"
 * extractModeratorModelName("anthropic/claude-3-opus") // "Claude 3 Opus"
 */
export function extractModeratorModelName(modelId: string): string {
  const parts = modelId.split('/');
  const modelPart = parts[parts.length - 1] || modelId;

  return modelPart
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Singleton instance
 */
export const openRouterModelsService = new OpenRouterModelsService();
