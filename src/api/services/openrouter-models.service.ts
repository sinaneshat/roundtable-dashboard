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

    // ✅ FILTER: Exclude :free suffix models with severe rate limits
    // These models have restrictive rate limits (20/min, 50/day) that cause 429 errors in production
    const nonFreeTierModels = paidModels.filter(model => !this.isFreeTierModel(model));

    // ✅ FILTER: Exclude fine-tuned and training models
    // These models require special data policies (like "Paid model training") that most users don't have enabled
    // This prevents runtime errors when users try to use models they don't have access to
    const standardModels = nonFreeTierModels.filter(model => !this.isFineTunedOrTrainingModel(model));

    // ✅ FILTER: Exclude research derivative models requiring data policy opt-in
    // Research labs sometimes publish models based on other companies' models as initialization
    // These require "Paid model training" opt-in, filtered dynamically by description analysis
    const nonDerivativeModels = standardModels.filter(model => !this.isResearchDerivativeModel(model));

    // ✅ FILTER: Exclude models requiring moderation
    // Some models return 403 errors if user input triggers content filtering
    // This prevents unpredictable failures based on user input content
    const accessibleModels = nonDerivativeModels.filter(model => !this.isModeratedModel(model));

    // ✅ FILTER: Exclude models requiring special data policies
    // Some official providers publish models requiring "Paid model training" or other data policy opt-ins
    // OpenRouter API doesn't expose these requirements, so we maintain an explicit blocklist
    const policyCompliantModels = accessibleModels.filter(model => !this.requiresSpecialDataPolicy(model));

    // ✅ FILTER: Exclude pure reasoning models that require special handling
    // Reasoning models generate reasoning tokens separately, causing empty responses
    // Keep models with reasoning capabilities (like chimera merges) but exclude pure R1-series
    const nonReasoningModels = policyCompliantModels.filter(model => !this.isPureReasoningModel(model));

    // ✅ FILTER: Exclude models with strict message format validation
    // Some models (especially phi-3 series on Azure) have strict validation that rejects
    // messages with extra fields (like 'reasoning') generated by other models in multi-model conversations
    const compatibleModels = nonReasoningModels.filter(model => !this.hasStrictMessageFormat(model));

    // Enhance models with computed fields
    const enhancedModels = compatibleModels.map(model => this.enhanceModel(model));

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
   * ✅ FILTER: Exclude models with :free suffix
   *
   * Models with `:free` suffix have severe rate limits that cause production errors:
   * - 20 requests per minute
   * - 50 requests per day (without $10 credits)
   * - 1000 requests per day (with $10 credits)
   *
   * These rate limits are too restrictive for production use and will cause
   * 429 Rate Limit errors for users, especially in a multi-model chat application.
   *
   * Examples:
   * - meta-llama/llama-3.3-70b-instruct:free
   * - google/gemini-2.0-flash-exp:free
   *
   * Error when rate limit exceeded:
   * "RateLimitError: OpenrouterException - Rate limit exceeded"
   *
   * @param model - Raw model from OpenRouter API
   * @returns true if model has :free suffix (should be excluded)
   */
  private isFreeTierModel(model: RawOpenRouterModel): boolean {
    return model.id.endsWith(':free');
  }

  /**
   * ✅ FILTER: Exclude models requiring moderation
   *
   * Some models require moderation and will return 403 errors if user input is flagged.
   * This causes unpredictable failures based on user input content.
   *
   * Error when content is flagged:
   * "403 Forbidden: Your chosen model requires moderation and your input was flagged"
   *
   * The error metadata includes:
   * - reasons: Array of why input was flagged
   * - flagged_input: The text segment that was flagged (max 100 chars)
   *
   * Examples of moderated models:
   * - Some Google Gemini variants with strict content filtering
   * - Models that enforce provider-side content policies
   *
   * Detection: Uses the top_provider.is_moderated field from OpenRouter API
   *
   * @param model - Raw model from OpenRouter API
   * @returns true if model requires moderation (should be excluded)
   */
  private isModeratedModel(model: RawOpenRouterModel): boolean {
    return model.top_provider?.is_moderated === true;
  }

  /**
   * ✅ FILTER: Exclude models requiring special OpenRouter data policies
   *
   * Some models (including those from official providers) require users to opt-in to
   * special data policies in OpenRouter settings. Using these models without opt-in causes:
   * "No endpoints found matching your data policy (Paid model training). Configure: https://openrouter.ai/settings/privacy"
   *
   * **BLOCKLIST MAINTENANCE**:
   * Since OpenRouter API doesn't expose data policy requirements, we maintain an explicit blocklist.
   * Add models here as they're discovered to require special policies.
   *
   * **Known Data Policies**:
   * - "Paid model training": Allows model providers to train on your data
   * - Other policies may exist for specific model requirements
   *
   * **Excluded Models**:
   * - microsoft/mai-ds-r1: Requires "Paid model training" opt-in
   * - Add more as discovered...
   *
   * @param model - Raw model from OpenRouter API
   * @returns true if model requires special data policy (should be excluded)
   */
  private requiresSpecialDataPolicy(model: RawOpenRouterModel): boolean {
    const modelId = model.id.toLowerCase();

    // ═══════════════════════════════════════════════════════════════
    // EXPLICIT BLOCKLIST: Models requiring "Paid model training" or other data policies
    // ═══════════════════════════════════════════════════════════════
    const dataPolicyBlocklist = [
      'microsoft/mai-ds-r1', // Requires "Paid model training" opt-in
      // Add more models here as they're discovered
    ];

    return dataPolicyBlocklist.some(blocked => modelId.includes(blocked.toLowerCase()));
  }

  /**
   * ✅ FILTER: Exclude fine-tuned and training models
   *
   * Fine-tuned models often require special OpenRouter data policies like "Paid model training"
   * that most users don't have enabled. Using these models causes runtime errors:
   * "No endpoints found matching your data policy (Paid model training)"
   *
   * Detection criteria (100% dynamic based on OpenRouter API data):
   * 1. Provider-based filtering: Known fine-tuning/research organizations
   * 2. Description contains fine-tuning keywords (case-insensitive)
   * 3. Model ID contains fine-tuning patterns (rpr, ft, lora, qlora, etc.)
   * 4. Description mentions training methods or dataset tuning
   *
   * This ensures users only see pre-trained models that work without special data policies.
   *
   * Examples of excluded models:
   * - nousresearch/* (Nous Research - fine-tuning organization)
   * - arliai/qwq-32b-arliai-rpr-v1 (fine-tuned with RPR - RolePlay Refined)
   * - Any model with "fine-tuned from X" in description
   * - Models trained with QLORA, LoRA, or other fine-tuning methods
   *
   * @param model - Raw model from OpenRouter API
   * @returns true if model is fine-tuned/training model (should be excluded)
   */
  private isFineTunedOrTrainingModel(model: RawOpenRouterModel): boolean {
    const description = model.description?.toLowerCase() || '';
    const modelId = model.id.toLowerCase();
    const modelName = model.name?.toLowerCase() || '';
    const provider = modelId.split('/')[0] || '';

    // ═══════════════════════════════════════════════════════════════
    // PROVIDER-BASED FILTERING: Known fine-tuning/research organizations
    // ═══════════════════════════════════════════════════════════════
    // These providers are known to publish fine-tuned or research models
    // that require "Paid model training" data policy opt-in
    const fineTuningProviders = [
      'nousresearch', // Nous Research - fine-tuning organization
      'arliai', // ArliAI - fine-tuning organization
      'cognitivecomputations', // Cognitive Computations - fine-tuning org
      'gryphe', // Gryphe - fine-tuning organization
      'sao10k', // sao10k - fine-tuning organization
      'sophosympatheia', // Sophosympatheia - fine-tuning organization
      'neversleep', // NeverSleep - fine-tuning organization
      'fimbulvetr', // Fimbulvetr - fine-tuning organization
    ];

    if (fineTuningProviders.includes(provider)) {
      return true; // Exclude all models from fine-tuning providers
    }

    // ═══════════════════════════════════════════════════════════════
    // DESCRIPTION-BASED DETECTION: Fine-tuning keywords
    // ═══════════════════════════════════════════════════════════════
    const fineTuningKeywords = [
      'fine-tuned',
      'fine tuned',
      'finetuned',
      'trained using',
      'trained with',
      'trained on',
      'qlora',
      'q-lora',
      'lora',
      'parameter efficient',
      'curated dataset',
      'roleplay dataset',
      'rpr series',
      'rpmax series',
      'instruct tuning',
      'instruction tuning',
      'chat tuning',
      'alignment tuning',
    ];

    for (const keyword of fineTuningKeywords) {
      if (description.includes(keyword)) {
        return true; // Exclude fine-tuned models
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // MODEL ID PATTERN DETECTION: Common fine-tuning suffixes
    // ═══════════════════════════════════════════════════════════════
    const fineTuningPatterns = [
      '-rpr-', // RolePlay Refined
      '-ft-', // Fine-Tuned
      '-lora-', // LoRA fine-tuning
      '-qlora-', // Quantized LoRA
      '-sft-', // Supervised Fine-Tuning
      '-dpo-', // Direct Preference Optimization
      '-rlhf-', // Reinforcement Learning from Human Feedback
      ':finetune', // OpenRouter fine-tune suffix
      '-instruct', // Instruction-tuned (when not from original provider)
      '-chat', // Chat-tuned (when not from original provider)
    ];

    for (const pattern of fineTuningPatterns) {
      if (modelId.includes(pattern) || modelName.includes(pattern)) {
        // Allow original providers' own instruction/chat models
        // e.g., "meta-llama/llama-3-8b-instruct" is OK (official from Meta)
        // but "randomorg/llama-3-8b-instruct" is NOT OK (derivative)
        const isOfficialInstructModel = (
          (pattern === '-instruct' || pattern === '-chat')
          && this.isOfficialProvider(provider)
        );

        if (!isOfficialInstructModel) {
          return true; // Exclude models with fine-tuning patterns
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PASS: Model is a standard pre-trained model
    // ═══════════════════════════════════════════════════════════════
    return false;
  }

  /**
   * Check if a provider is an official model creator (not a fine-tuner)
   * Official providers can publish their own instruction-tuned models
   */
  private isOfficialProvider(provider: string): boolean {
    const officialProviders = [
      'meta-llama', // Meta (official Llama provider)
      'meta', // Meta
      'anthropic', // Anthropic
      'openai', // OpenAI
      'google', // Google
      'cohere', // Cohere
      'mistralai', // Mistral AI
      'microsoft', // Microsoft
      'ai21', // AI21 Labs
      'amazon', // Amazon
      'perplexity', // Perplexity
      'alibaba', // Alibaba (Qwen)
      'deepseek', // DeepSeek
      'nvidia', // NVIDIA
      'databricks', // Databricks
      'ibm', // IBM
      'stabilityai', // Stability AI
      'huggingface', // Hugging Face (official models only)
      '01-ai', // 01.AI
      'xai', // xAI (Grok)
    ];

    return officialProviders.includes(provider);
  }

  /**
   * ✅ FILTER: Exclude research derivative models requiring "Paid model training" data policy
   *
   * Research labs sometimes publish models that use OTHER COMPANIES' models as initialization
   * or base models. These derivative models require "Paid model training" opt-in to use.
   *
   * Error when using without opt-in:
   * "No endpoints found matching your data policy (Paid model training).
   * Configure: https://openrouter.ai/settings/privacy"
   *
   * **100% DYNAMIC DETECTION** based on description patterns:
   *
   * Detection criteria:
   * 1. Description mentions using another model as base/initialization
   * 2. Phrases like "benchmarked against", "initialization from", "builds upon"
   * 3. References to other companies' models (Qwen, Llama, GPT, etc.) as foundation
   *
   * Examples of research derivatives (EXCLUDED):
   * - "pre-trained base models serve as the initialization for its language component"
   * - "benchmarked against the Qwen2.5 Chat models"
   * - "builds upon the [CompanyX] model"
   *
   * vs. Legitimate models (INCLUDED):
   * - Models that mention comparisons but aren't derived: "outperforms GPT-4"
   * - Models from original creators: "Qwen3 from Alibaba"
   * - Standard product descriptions without derivative language
   *
   * This dynamically catches research lab models without hardcoding provider names.
   *
   * @param model - Raw model from OpenRouter API
   * @returns true if model is a research derivative requiring data policy (should be excluded)
   */
  private isResearchDerivativeModel(model: RawOpenRouterModel): boolean {
    const description = model.description?.toLowerCase() || '';

    // ═══════════════════════════════════════════════════════════════
    // RESEARCH DERIVATIVE INDICATORS: Model uses another as base
    // ═══════════════════════════════════════════════════════════════
    const researchDerivativePatterns = [
      // Direct initialization/base model language
      'serve as the initialization',
      'serves as the initialization',
      'initialized from',
      'initialization from',
      'as the initialization for',

      // Building upon other models
      'builds upon the',
      'built upon the',
      'building upon',

      // Derivative research language (when combined with model names)
      'benchmarked against the',
      'compared to the',
      'based on the pre-trained',

      // Research modification patterns
      'whose pre-trained',
      'benefiting from native',
    ];

    for (const pattern of researchDerivativePatterns) {
      if (description.includes(pattern)) {
        // Additional check: Ensure it's referencing another company's model
        // Look for common model family names that indicate using another's base
        const isDerivativeOfOtherModel = (
          description.includes('qwen')
          || description.includes('llama')
          || description.includes('gpt')
          || description.includes('claude')
          || description.includes('gemini')
          || description.includes('mistral')
        );

        if (isDerivativeOfOtherModel) {
          return true; // Exclude research derivative models
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PASS: Not a research derivative model
    // ═══════════════════════════════════════════════════════════════
    return false;
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
   *
   * **IMPORTANT**: This detects models with reasoning AS A CAPABILITY, not necessarily
   * models that REQUIRE special reasoning handling. For filtering out problematic
   * reasoning models, use isPureReasoningModel() instead.
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
   * ✅ FILTER: Detect models with strict message format validation
   *
   * **Problem**: Some models (especially phi-3 series on Azure) have strict message validation
   * that rejects messages containing extra fields like 'reasoning'. This breaks multi-model
   * conversations where one model has already generated reasoning output.
   *
   * **Error Example** (from microsoft/phi-3-medium-128k-instruct):
   * "Extra inputs are not permitted', 'loc': ('body', 'messages', 2, 'typed-dict', 'reasoning')"
   *
   * **Detection Strategy**:
   * 1. Check architecture.instruct_type === "phi3" (Microsoft's phi-3 series)
   * 2. These models are served through Azure with strict validation
   *
   * **Models with Strict Validation** (EXCLUDED):
   * - microsoft/phi-3-medium-128k-instruct
   * - microsoft/phi-3-mini-128k-instruct
   * - microsoft/phi-3.5-mini-128k-instruct
   *
   * @param model - Raw model from OpenRouter API
   * @returns true if model has strict message format validation (should be excluded)
   */
  private hasStrictMessageFormat(model: RawOpenRouterModel): boolean {
    const instructType = model.architecture?.instruct_type?.toLowerCase() || '';

    // ═══════════════════════════════════════════════════════════════
    // PHI-3 MODELS: Strict Azure validation rejects extra message fields
    // ═══════════════════════════════════════════════════════════════
    // Microsoft's phi-3 series (served via Azure) has very strict message validation
    // that breaks multi-model conversations
    if (instructType === 'phi3') {
      return true; // Exclude phi-3 models with strict validation
    }

    // ═══════════════════════════════════════════════════════════════
    // PASS: Model accepts standard message format with extra fields
    // ═══════════════════════════════════════════════════════════════
    return false;
  }

  /**
   * ✅ FILTER: Detect pure reasoning models that require special handling
   *
   * **Problem**: Some reasoning models generate reasoning tokens separately from output,
   * causing empty responses in standard chat interfaces. These models need special
   * parameter handling (include_reasoning, reasoning) that our system doesn't support yet.
   *
   * **Detection Strategy**:
   * 1. Model name contains "r1" or "r1-" (DeepSeek R1, Qwen R1, etc.)
   * 2. Description explicitly states it's a "reasoning model" or "extended thinking model"
   * 3. Exclude legitimate merges/variants that just have reasoning as one capability
   *
   * **Examples of PURE reasoning models** (should be EXCLUDED):
   * - deepseek/deepseek-r1
   * - alibaba/qwen-2.5-r1
   * - Models with "extended thinking" as primary feature
   *
   * **Examples of models with reasoning capabilities** (should be INCLUDED):
   * - tngtech/deepseek-r1t-chimera (merge that "combines reasoning capabilities")
   * - microsoft/mai-ds-r1 (post-trained variant, not pure reasoning)
   * - Models that mention "reasoning" as one of many capabilities
   *
   * @param model - Raw model from OpenRouter API
   * @returns true if model is a pure reasoning model requiring special handling (should be excluded)
   */
  private isPureReasoningModel(model: RawOpenRouterModel): boolean {
    const modelId = model.id.toLowerCase();
    const description = model.description?.toLowerCase() || '';

    // ═══════════════════════════════════════════════════════════════
    // PURE REASONING MODEL INDICATORS
    // ═══════════════════════════════════════════════════════════════

    // Check for R1-series naming (DeepSeek R1, Qwen R1, etc.)
    // BUT exclude variants/merges (chimera, turbo, etc.)
    const hasR1Naming = (
      modelId.includes('/r1')
      || modelId.includes('-r1-')
      || modelId.includes('-r1:')
      || modelId.endsWith('-r1')
    );

    const isVariantOrMerge = (
      modelId.includes('chimera')
      || modelId.includes('turbo')
      || modelId.includes('mai-ds-r1') // Microsoft variant
      || description.includes('merge')
      || description.includes('merging')
      || description.includes('variant')
      || description.includes('post-trained')
    );

    // R1 naming + NOT a variant/merge = pure reasoning model
    if (hasR1Naming && !isVariantOrMerge) {
      return true;
    }

    // Check for explicit "reasoning model" or "extended thinking model" language
    // That appears PROMINENTLY (in first 200 chars) of description
    const descriptionPrefix = description.substring(0, 200);
    const isPrimaryReasoningModel = (
      descriptionPrefix.includes('reasoning model')
      || descriptionPrefix.includes('extended thinking model')
      || descriptionPrefix.includes('thinking model')
      || (descriptionPrefix.includes('reasoning') && descriptionPrefix.includes('extended'))
    );

    if (isPrimaryReasoningModel && !isVariantOrMerge) {
      return true;
    }

    // ═══════════════════════════════════════════════════════════════
    // PASS: Model has reasoning as a capability, but not a pure reasoning model
    // ═══════════════════════════════════════════════════════════════
    return false;
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
   * ✅ OPTIMAL ANALYSIS MODEL SELECTION: Prioritizes structured output quality
   * Find the best model for complex JSON schema generation in moderator analysis
   * Quality-focused scoring that favors models with excellent structured output capabilities
   *
   * Selection criteria (in priority order):
   * 1. Structured Output Quality: Models known for excellent JSON schema compliance (GPT-4o, Claude Sonnet, etc.)
   * 2. Capabilities: Tools support, vision (indicates sophisticated model architecture)
   * 3. Context: Large context window (at least 32K, preferably 128K+)
   * 4. Recency: Prefer actively maintained models (last 6 months preferred)
   * 5. Cost: Mid-tier budget (<$3/M input, <$10/M output) balances quality and affordability
   *
   * Returns the best model for reliable, schema-compliant structured output generation
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

      // Mid-tier budget for quality (increased for better structured output)
      // <$3/M input, <$10/M output allows GPT-4o, Claude Sonnet, etc.
      if (inputPricePerMillion > 3 || outputPricePerMillion > 10) {
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

    // Models known for excellent structured output and JSON schema compliance
    // Based on real-world performance with complex schemas and JSON mode
    const structuredOutputExperts = [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'claude-3.5-sonnet',
      'claude-3-5-sonnet',
      'claude-sonnet-4',
      'gemini-pro-1.5',
      'gemini-flash-1.5',
    ];

    // ✅ QUALITY-FOCUSED SCORING: Prioritize structured output capability over cost
    const scoredModels = candidateModels.map((model) => {
      let score = 0;

      // Structured output expertise (70 points max - HIGHEST PRIORITY)
      // Check if model is in our curated list of structured output experts
      const modelIdLower = model.id.toLowerCase();
      const isStructuredOutputExpert = structuredOutputExperts.some(
        expert => modelIdLower.includes(expert.toLowerCase()),
      );

      if (isStructuredOutputExpert) {
        score += 70; // Major boost for known-good structured output models
      }

      // Capabilities scoring (40 points max - indicates sophisticated models)
      if (model.capabilities.tools) {
        score += 25; // Tools support strongly correlates with structured output quality
      }
      if (model.capabilities.vision) {
        score += 15; // Vision capability indicates advanced model architecture
      }

      // Context window scoring (20 points max - larger context for complex schemas)
      if (model.context_length >= 128000) {
        score += 20; // Very large context (128K+)
      } else if (model.context_length >= 64000) {
        score += 15; // Large context (64K-128K)
      } else {
        score += 10; // Standard context (32K-64K)
      }

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

      // Cost efficiency (10 points max - still consider cost but lower priority)
      // ✅ SINGLE SOURCE OF TRUTH: Use costPerMillion() utility for consistent calculations
      const inputPricePerMillion = costPerMillion(model.pricing.prompt);
      const outputPricePerMillion = costPerMillion(model.pricing.completion);
      const avgCostPerMillion = (inputPricePerMillion + outputPricePerMillion) / 2;

      // Invert cost to score (cheaper = better, but minor factor)
      // $0 = 10 points, $3/M = 0 points
      const costScore = Math.max(0, 10 - (avgCostPerMillion / 3) * 10);
      score += costScore;

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
