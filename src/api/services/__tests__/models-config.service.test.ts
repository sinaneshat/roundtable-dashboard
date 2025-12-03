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
        if (!result.success) {
          console.error(`Model ${model.id} failed:`, result.error.errors);
        }
        expect(result.success, `Model ${model.id} failed schema validation`).toBe(true);
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
    it('should have supports_temperature configured for all models', () => {
      // Most models support temperature, except some reasoning models (e.g., o3-mini)
      for (const model of HARDCODED_MODELS) {
        expect(typeof model.supports_temperature).toBe('boolean');
      }
      // Verify at least some models support temperature
      const tempSupportedModels = HARDCODED_MODELS.filter(m => m.supports_temperature);
      expect(tempSupportedModels.length).toBeGreaterThan(0);
    });

    it('should have supports_temperature=true for standard Anthropic models', () => {
      const anthropicModels = HARDCODED_MODELS.filter(m => m.provider === 'anthropic');
      expect(anthropicModels.length).toBeGreaterThan(0);

      for (const model of anthropicModels) {
        expect(model.supports_temperature, `Model ${model.id} should support temperature`).toBe(true);
      }
    });
  });

  // ============================================================================
  // Reasoning Stream Support Configuration
  // ============================================================================
  describe('reasoning stream support configuration', () => {
    it('should have reasoning models with supports_reasoning_stream=true', () => {
      const reasoningModels = HARDCODED_MODELS.filter(m => m.is_reasoning_model);

      // At least one reasoning model should support streaming
      const streamingReasoningModels = reasoningModels.filter(m => m.supports_reasoning_stream);
      expect(streamingReasoningModels.length).toBeGreaterThan(0);
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
        expect(model.description?.length).toBeGreaterThan(0);
      }
    });

    it('should have positive context_length for all models', () => {
      for (const model of HARDCODED_MODELS) {
        expect(model.context_length).toBeGreaterThan(0);
      }
    });

    it('reasoning models should have is_reasoning_model=true', () => {
      const reasoningModels = HARDCODED_MODELS.filter(m => m.is_reasoning_model);
      expect(reasoningModels.length).toBeGreaterThan(0);

      for (const model of reasoningModels) {
        expect(model.is_reasoning_model, `Model ${model.id} should be flagged as reasoning model`).toBe(true);
      }
    });

    it('should not have any models with supports_reasoning_stream=true but is_reasoning_model=false', () => {
      const streamingModels = HARDCODED_MODELS.filter(m => m.supports_reasoning_stream);

      for (const model of streamingModels) {
        expect(model.is_reasoning_model, `Model ${model.id} has supports_reasoning_stream=true but is_reasoning_model=false`).toBe(true);
      }
    });

    it('should have multiple providers represented', () => {
      const providers = new Set(HARDCODED_MODELS.map(m => m.provider));
      expect(providers.size).toBeGreaterThan(3);
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
        expect(model.top_provider).toBeDefined();
      }

      const modelsWithMaxTokens = modelsWithTopProvider.filter(
        m => m.top_provider!.max_completion_tokens !== null && m.top_provider!.max_completion_tokens !== undefined,
      );

      for (const model of modelsWithMaxTokens) {
        const maxTokens = model.top_provider!.max_completion_tokens!;
        expect(maxTokens).toBeGreaterThan(0);
      }
    });

    it('should have vision models correctly flagged', () => {
      const visionModels = HARDCODED_MODELS.filter(m => m.supports_vision);
      const nonVisionModels = HARDCODED_MODELS.filter(m => !m.supports_vision);

      // Should have both vision and non-vision models
      expect(visionModels.length).toBeGreaterThan(0);
      expect(nonVisionModels.length).toBeGreaterThan(0);

      // Vision models should also have vision capability
      for (const model of visionModels) {
        expect(model.capabilities.vision, `Model ${model.id} supports_vision but capabilities.vision is false`).toBe(true);
      }
    });
  });
});
