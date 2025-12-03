/**
 * Streaming Reasoning Configuration Tests
 *
 * Tests for the reasoning configuration logic used in the streaming handler.
 * Verifies that providerOptions are correctly built based on model capabilities.
 *
 * @module api/services/__tests__/streaming-reasoning-config.test
 */

import { describe, expect, it } from 'vitest';

import type { HardcodedModel } from '../models-config.service';
import { HARDCODED_MODELS } from '../models-config.service';

/**
 * Helper function that replicates the reasoning config logic from streaming.handler.ts
 * This allows us to test the logic in isolation.
 */
function buildReasoningProviderOptions(modelInfo: HardcodedModel | undefined) {
  const supportsReasoningStream = modelInfo?.supports_reasoning_stream ?? false;

  return supportsReasoningStream
    ? {
        openrouter: {
          reasoning: {
            effort: 'medium',
          },
        },
      }
    : undefined;
}

/**
 * Helper function that replicates temperature config logic from streaming.handler.ts
 */
function buildTemperatureConfig(modelInfo: HardcodedModel | undefined, requestedTemperature: number = 0.7) {
  const modelSupportsTemperature = modelInfo?.supports_temperature ?? true;
  return modelSupportsTemperature ? requestedTemperature : undefined;
}

describe('streaming reasoning configuration logic', () => {
  // ============================================================================
  // Provider Options Building
  // ============================================================================
  describe('buildReasoningProviderOptions', () => {
    it('should return reasoning options for models with supports_reasoning_stream=true', () => {
      const streamingReasoningModels = HARDCODED_MODELS.filter(m => m.supports_reasoning_stream);

      expect(streamingReasoningModels.length).toBeGreaterThan(0);

      for (const model of streamingReasoningModels) {
        const options = buildReasoningProviderOptions(model);
        expect(options).toBeDefined();
        expect(options).toEqual({
          openrouter: {
            reasoning: {
              effort: 'medium',
            },
          },
        });
      }
    });

    it('should return undefined for models with supports_reasoning_stream=false', () => {
      const nonStreamingModels = HARDCODED_MODELS.filter(m => !m.supports_reasoning_stream);

      expect(nonStreamingModels.length).toBeGreaterThan(0);

      for (const model of nonStreamingModels) {
        const options = buildReasoningProviderOptions(model);
        expect(options).toBeUndefined();
      }
    });

    it('should return undefined when modelInfo is undefined', () => {
      const options = buildReasoningProviderOptions(undefined);
      expect(options).toBeUndefined();
    });

    it('should default to false when supports_reasoning_stream is not defined', () => {
      const partialModel = {
        id: 'test/model',
        name: 'Test Model',
      } as unknown as HardcodedModel;

      const options = buildReasoningProviderOptions(partialModel);
      expect(options).toBeUndefined();
    });
  });

  // ============================================================================
  // Temperature Configuration
  // ============================================================================
  describe('buildTemperatureConfig', () => {
    it('should return requested temperature for models that support it', () => {
      const tempSupportModels = HARDCODED_MODELS.filter(m => m.supports_temperature);

      expect(tempSupportModels.length).toBeGreaterThan(0);

      for (const model of tempSupportModels) {
        const temp = buildTemperatureConfig(model, 0.8);
        expect(temp, `Model ${model.id} should return requested temperature`).toBe(0.8);
      }
    });

    it('should use default temperature of 0.7 when not specified', () => {
      const anyModel = HARDCODED_MODELS.find(m => m.supports_temperature);
      expect(anyModel).toBeDefined();

      const temp = buildTemperatureConfig(anyModel);
      expect(temp).toBe(0.7);
    });

    it('should return default temperature when modelInfo is undefined', () => {
      const temp = buildTemperatureConfig(undefined, 0.8);
      expect(temp).toBe(0.8);
    });
  });

  // ============================================================================
  // Combined Configuration Behavior
  // ============================================================================
  describe('combined configuration behavior', () => {
    it('reasoning models with streaming should have both temperature and reasoning options', () => {
      const streamingReasoningModels = HARDCODED_MODELS.filter(
        m => m.is_reasoning_model && m.supports_reasoning_stream && m.supports_temperature,
      );

      for (const model of streamingReasoningModels) {
        const temp = buildTemperatureConfig(model, 0.7);
        const options = buildReasoningProviderOptions(model);

        expect(temp).toBe(0.7);
        expect(options).toBeDefined();
      }
    });

    it('standard non-reasoning models should have temperature but no reasoning options', () => {
      const standardModels = HARDCODED_MODELS.filter(
        m => !m.is_reasoning_model && m.supports_temperature,
      );

      expect(standardModels.length).toBeGreaterThan(0);

      for (const model of standardModels) {
        const temp = buildTemperatureConfig(model, 0.7);
        const options = buildReasoningProviderOptions(model);

        expect(temp).toBe(0.7);
        expect(options).toBeUndefined();
      }
    });
  });

  // ============================================================================
  // Edge Cases and Robustness
  // ============================================================================
  describe('edge cases and robustness', () => {
    it('reasoning options should always use medium effort', () => {
      const reasoningModels = HARDCODED_MODELS.filter(m => m.supports_reasoning_stream);

      for (const model of reasoningModels) {
        const options = buildReasoningProviderOptions(model);
        expect(options).toBeDefined();
        expect(options!.openrouter.reasoning.effort).toBe('medium');
      }
    });

    it('all non-reasoning stream models should return undefined options', () => {
      const nonStreamingModels = HARDCODED_MODELS.filter(m => !m.supports_reasoning_stream);

      expect(nonStreamingModels.length).toBeGreaterThan(0);

      for (const model of nonStreamingModels) {
        const options = buildReasoningProviderOptions(model);
        expect(options).toBeUndefined();
      }
    });
  });

  // ============================================================================
  // Integration with Model Catalog
  // ============================================================================
  describe('integration with model catalog', () => {
    it('should correctly configure all reasoning models in the catalog', () => {
      const reasoningModels = HARDCODED_MODELS.filter(m => m.is_reasoning_model);

      expect(reasoningModels.length).toBeGreaterThan(0);

      for (const model of reasoningModels) {
        expect(typeof model.supports_reasoning_stream).toBe('boolean');

        const options = buildReasoningProviderOptions(model);
        const shouldHaveOptions = model.supports_reasoning_stream;
        const optionsDefined = options !== undefined;
        expect(optionsDefined, `Model ${model.id} options defined mismatch`).toBe(shouldHaveOptions);
      }
    });

    it('all models in catalog should have temperature support configured', () => {
      // All models must have supports_temperature as a boolean (true or false)
      // Note: Some reasoning models (o3-mini, o1-pro) don't support temperature
      for (const model of HARDCODED_MODELS) {
        expect(typeof model.supports_temperature, `Model ${model.id} should have boolean supports_temperature`).toBe('boolean');
      }
      // Verify at least some models support temperature
      const tempSupportedModels = HARDCODED_MODELS.filter(m => m.supports_temperature);
      expect(tempSupportedModels.length).toBeGreaterThan(0);
    });
  });
});
