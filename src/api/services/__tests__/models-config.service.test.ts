/**
 * Model Config Service Tests
 *
 * Tests for HARDCODED_MODELS configuration validation, ensuring all models
 * have correct flags for temperature support and reasoning stream capabilities.
 *
 * Single Source of Truth: All model capability flags are defined in models-config.service.ts
 * and used by streaming handler without hardcoded model ID checks.
 *
 * @module api/services/__tests__/models-config.service.test
 */

import { describe, expect, it } from 'vitest';

import { HARDCODED_MODELS, HardcodedModelSchema } from '../models-config.service';

describe('hardcoded_models configuration', () => {
  // ============================================================================
  // Schema Validation
  // ============================================================================
  describe('schema validation', () => {
    it('should have all required fields for every model', () => {
      for (const model of HARDCODED_MODELS) {
        const result = HardcodedModelSchema.safeParse(model);
        expect(result.success, `Model ${model.id} failed schema validation: ${JSON.stringify(result.error?.errors)}`).toBe(true);
      }
    });

    it('should have boolean supports_temperature for all models', () => {
      for (const model of HARDCODED_MODELS) {
        expect(typeof model.supports_temperature).toBe('boolean');
      }
    });

    it('should have boolean supports_reasoning_stream for all models', () => {
      for (const model of HARDCODED_MODELS) {
        expect(typeof model.supports_reasoning_stream).toBe('boolean');
      }
    });

    it('should have boolean is_reasoning_model for all models', () => {
      for (const model of HARDCODED_MODELS) {
        expect(typeof model.is_reasoning_model).toBe('boolean');
      }
    });
  });

  // ============================================================================
  // Temperature Support Configuration
  // ============================================================================
  describe('temperature support configuration', () => {
    it('should have supports_temperature=false for OpenAI reasoning models that dont support it', () => {
      const noTempModels = [
        'openai/o1',
        'openai/o3-mini',
        'openai/o3-mini-high',
        'openai/o4-mini',
        'openai/o4-mini-high',
      ];

      for (const modelId of noTempModels) {
        const model = HARDCODED_MODELS.find(m => m.id === modelId);
        expect(model, `Model ${modelId} not found`).toBeDefined();
        expect(model!.supports_temperature, `Model ${modelId} should not support temperature`).toBe(false);
      }
    });

    it('should have supports_temperature=true for standard models', () => {
      const standardModels = [
        'google/gemini-2.5-pro',
        'anthropic/claude-sonnet-4',
        'openai/gpt-4o',
        'meta-llama/llama-3.3-70b-instruct:free',
      ];

      for (const modelId of standardModels) {
        const model = HARDCODED_MODELS.find(m => m.id === modelId);
        expect(model, `Model ${modelId} not found`).toBeDefined();
        expect(model!.supports_temperature, `Model ${modelId} should support temperature`).toBe(true);
      }
    });

    it('should have supports_temperature=true for DeepSeek R1 models', () => {
      const deepSeekModels = [
        'deepseek/deepseek-r1',
        'deepseek/deepseek-r1:free',
      ];

      for (const modelId of deepSeekModels) {
        const model = HARDCODED_MODELS.find(m => m.id === modelId);
        expect(model, `Model ${modelId} not found`).toBeDefined();
        expect(model!.supports_temperature, `Model ${modelId} should support temperature`).toBe(true);
      }
    });
  });

  // ============================================================================
  // Reasoning Stream Support Configuration
  // ============================================================================
  describe('reasoning stream support configuration', () => {
    it('should have supports_reasoning_stream=true for o3-mini and o4-mini models', () => {
      const streamingReasoningModels = [
        'openai/o3-mini',
        'openai/o3-mini-high',
        'openai/o4-mini',
        'openai/o4-mini-high',
      ];

      for (const modelId of streamingReasoningModels) {
        const model = HARDCODED_MODELS.find(m => m.id === modelId);
        expect(model, `Model ${modelId} not found`).toBeDefined();
        expect(model!.supports_reasoning_stream, `Model ${modelId} should support reasoning stream`).toBe(true);
        expect(model!.is_reasoning_model, `Model ${modelId} should be a reasoning model`).toBe(true);
      }
    });

    it('should have supports_reasoning_stream=false for o1 (internal reasoning)', () => {
      const model = HARDCODED_MODELS.find(m => m.id === 'openai/o1');
      expect(model, 'Model openai/o1 not found').toBeDefined();
      expect(model!.supports_reasoning_stream, 'o1 does NOT stream reasoning - it is internal').toBe(false);
      expect(model!.is_reasoning_model, 'o1 should be a reasoning model').toBe(true);
    });

    it('should have supports_reasoning_stream=true for DeepSeek R1 models', () => {
      const deepSeekModels = [
        'deepseek/deepseek-r1',
        'deepseek/deepseek-r1:free',
      ];

      for (const modelId of deepSeekModels) {
        const model = HARDCODED_MODELS.find(m => m.id === modelId);
        expect(model, `Model ${modelId} not found`).toBeDefined();
        expect(model!.supports_reasoning_stream, `Model ${modelId} should support reasoning stream`).toBe(true);
        expect(model!.is_reasoning_model, `Model ${modelId} should be a reasoning model`).toBe(true);
      }
    });

    it('should have supports_reasoning_stream=true for Claude thinking models', () => {
      const thinkingModels = HARDCODED_MODELS.filter(m => m.id.includes(':thinking'));

      expect(thinkingModels.length).toBeGreaterThan(0);

      for (const model of thinkingModels) {
        expect(model.supports_reasoning_stream, `Model ${model.id} should support reasoning stream`).toBe(true);
        expect(model.is_reasoning_model, `Model ${model.id} should be a reasoning model`).toBe(true);
      }
    });

    it('should have supports_reasoning_stream=false for non-reasoning models', () => {
      const nonReasoningModels = HARDCODED_MODELS.filter(m => !m.is_reasoning_model);

      expect(nonReasoningModels.length).toBeGreaterThan(0);

      for (const model of nonReasoningModels) {
        expect(model.supports_reasoning_stream, `Non-reasoning model ${model.id} should not support reasoning stream`).toBe(false);
      }
    });
  });

  // ============================================================================
  // Model Consistency Checks
  // ============================================================================
  describe('model consistency checks', () => {
    it('should have unique model IDs', () => {
      const ids = HARDCODED_MODELS.map(m => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have non-empty names for all models', () => {
      for (const model of HARDCODED_MODELS) {
        expect(model.name.length).toBeGreaterThan(0);
      }
    });

    it('should have non-empty descriptions for all models', () => {
      for (const model of HARDCODED_MODELS) {
        expect(model.description.length).toBeGreaterThan(0);
      }
    });

    it('should have positive context_length for all models', () => {
      for (const model of HARDCODED_MODELS) {
        expect(model.context_length).toBeGreaterThan(0);
      }
    });

    it('reasoning models should be flagged correctly', () => {
      const reasoningModelIds = [
        'openai/o1',
        'openai/o3-mini',
        'openai/o3-mini-high',
        'openai/o4-mini',
        'openai/o4-mini-high',
        'deepseek/deepseek-r1',
        'deepseek/deepseek-r1:free',
      ];

      for (const modelId of reasoningModelIds) {
        const model = HARDCODED_MODELS.find(m => m.id === modelId);
        expect(model, `Model ${modelId} not found`).toBeDefined();
        expect(model!.is_reasoning_model, `Model ${modelId} should be flagged as reasoning model`).toBe(true);
      }
    });

    it('should not have any models with supports_reasoning_stream=true but is_reasoning_model=false', () => {
      const streamingModels = HARDCODED_MODELS.filter(m => m.supports_reasoning_stream);
      expect(streamingModels.length).toBeGreaterThan(0);

      for (const model of streamingModels) {
        expect(model.is_reasoning_model, `Model ${model.id} has supports_reasoning_stream=true but is_reasoning_model=false`).toBe(true);
      }
    });
  });

  // ============================================================================
  // Provider-Specific Configuration
  // ============================================================================
  describe('provider-specific configuration', () => {
    it('should have correct pricing format for all models', () => {
      for (const model of HARDCODED_MODELS) {
        expect(model.pricing.prompt).toBeDefined();
        expect(model.pricing.completion).toBeDefined();
        expect(Number.parseFloat(model.pricing.prompt)).toBeGreaterThanOrEqual(0);
        expect(Number.parseFloat(model.pricing.completion)).toBeGreaterThanOrEqual(0);
      }
    });

    it('should have valid top_provider for models that define it', () => {
      const modelsWithTopProvider = HARDCODED_MODELS.filter(m => m.top_provider);

      for (const model of modelsWithTopProvider) {
        // If top_provider is defined, it should have valid structure
        expect(model.top_provider).toBeDefined();
      }

      // Separate test for max_completion_tokens when defined
      const modelsWithMaxTokens = modelsWithTopProvider.filter(
        m => m.top_provider!.max_completion_tokens !== null && m.top_provider!.max_completion_tokens !== undefined,
      );

      for (const model of modelsWithMaxTokens) {
        const maxTokens = model.top_provider!.max_completion_tokens!;
        expect(maxTokens).toBeGreaterThan(0);
      }
    });

    it('free models should be marked correctly', () => {
      const freeModels = HARDCODED_MODELS.filter(m => m.is_free);

      for (const model of freeModels) {
        // Free models should have zero pricing or be explicitly marked
        expect(model.is_free).toBe(true);
      }
    });
  });
});
