/**
 * Streaming Reasoning Configuration Tests
 *
 * Tests for the reasoning configuration logic used in the streaming handler.
 * Verifies that providerOptions are correctly built based on model capabilities.
 *
 * Key behavior:
 * - Models with supports_reasoning_stream=true get reasoning providerOptions
 * - Models with supports_reasoning_stream=false get no providerOptions
 * - o1 specifically should NOT get reasoning options (internal reasoning)
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
    it('should return reasoning options for o3-mini (supports streaming reasoning)', () => {
      const model = HARDCODED_MODELS.find(m => m.id === 'openai/o3-mini');
      const options = buildReasoningProviderOptions(model);

      expect(options).toBeDefined();
      expect(options).toEqual({
        openrouter: {
          reasoning: {
            effort: 'medium',
          },
        },
      });
    });

    it('should return reasoning options for o4-mini (supports streaming reasoning)', () => {
      const model = HARDCODED_MODELS.find(m => m.id === 'openai/o4-mini');
      const options = buildReasoningProviderOptions(model);

      expect(options).toBeDefined();
      expect(options).toEqual({
        openrouter: {
          reasoning: {
            effort: 'medium',
          },
        },
      });
    });

    it('should return undefined for o1 (internal reasoning - no streaming)', () => {
      const model = HARDCODED_MODELS.find(m => m.id === 'openai/o1');
      const options = buildReasoningProviderOptions(model);

      expect(options).toBeUndefined();
    });

    it('should return reasoning options for DeepSeek R1 models', () => {
      const deepSeekModels = ['deepseek/deepseek-r1', 'deepseek/deepseek-r1:free'];

      for (const modelId of deepSeekModels) {
        const model = HARDCODED_MODELS.find(m => m.id === modelId);
        expect(model, `Model ${modelId} not found`).toBeDefined();

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

    it('should return reasoning options for Claude thinking models', () => {
      const thinkingModels = HARDCODED_MODELS.filter(m => m.id.includes(':thinking'));

      expect(thinkingModels.length).toBeGreaterThan(0);

      for (const model of thinkingModels) {
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

    it('should return undefined for standard non-reasoning models', () => {
      const standardModels = [
        'google/gemini-2.5-pro',
        'anthropic/claude-sonnet-4',
        'openai/gpt-4o',
        'meta-llama/llama-3.3-70b-instruct:free',
      ];

      for (const modelId of standardModels) {
        const model = HARDCODED_MODELS.find(m => m.id === modelId);
        expect(model, `Model ${modelId} not found`).toBeDefined();

        const options = buildReasoningProviderOptions(model);
        expect(options).toBeUndefined();
      }
    });

    it('should return undefined when modelInfo is undefined', () => {
      const options = buildReasoningProviderOptions(undefined);
      expect(options).toBeUndefined();
    });

    it('should default to false when supports_reasoning_stream is not defined', () => {
      // Simulate a model without the flag (edge case for future-proofing)
      const partialModel = {
        id: 'test/model',
        name: 'Test Model',
        // ... other required fields but missing supports_reasoning_stream
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
      const model = HARDCODED_MODELS.find(m => m.id === 'google/gemini-2.5-pro');
      const temp = buildTemperatureConfig(model, 0.8);

      expect(temp).toBe(0.8);
    });

    it('should return undefined for o1 (does not support temperature)', () => {
      const model = HARDCODED_MODELS.find(m => m.id === 'openai/o1');
      const temp = buildTemperatureConfig(model, 0.7);

      expect(temp).toBeUndefined();
    });

    it('should return undefined for o3-mini (does not support temperature)', () => {
      const model = HARDCODED_MODELS.find(m => m.id === 'openai/o3-mini');
      const temp = buildTemperatureConfig(model, 0.7);

      expect(temp).toBeUndefined();
    });

    it('should return undefined for o4-mini (does not support temperature)', () => {
      const model = HARDCODED_MODELS.find(m => m.id === 'openai/o4-mini');
      const temp = buildTemperatureConfig(model, 0.7);

      expect(temp).toBeUndefined();
    });

    it('should return temperature for DeepSeek R1 (supports temperature)', () => {
      const model = HARDCODED_MODELS.find(m => m.id === 'deepseek/deepseek-r1');
      expect(model, 'Model deepseek/deepseek-r1 not found').toBeDefined();

      const temp = buildTemperatureConfig(model, 0.5);
      expect(temp).toBe(0.5);
    });

    it('should use default temperature of 0.7 when not specified', () => {
      const model = HARDCODED_MODELS.find(m => m.id === 'anthropic/claude-sonnet-4');
      const temp = buildTemperatureConfig(model);

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
    it('o1 should have no temperature and no reasoning options', () => {
      const model = HARDCODED_MODELS.find(m => m.id === 'openai/o1');
      expect(model).toBeDefined();

      const temp = buildTemperatureConfig(model, 0.7);
      const options = buildReasoningProviderOptions(model);

      expect(temp).toBeUndefined();
      expect(options).toBeUndefined();
    });

    it('o3-mini should have no temperature but has reasoning options', () => {
      const model = HARDCODED_MODELS.find(m => m.id === 'openai/o3-mini');
      expect(model).toBeDefined();

      const temp = buildTemperatureConfig(model, 0.7);
      const options = buildReasoningProviderOptions(model);

      expect(temp).toBeUndefined();
      expect(options).toBeDefined();
    });

    it('deepSeek R1 should have both temperature and reasoning options', () => {
      const model = HARDCODED_MODELS.find(m => m.id === 'deepseek/deepseek-r1');
      expect(model, 'Model deepseek/deepseek-r1 not found').toBeDefined();

      const temp = buildTemperatureConfig(model, 0.7);
      const options = buildReasoningProviderOptions(model);

      expect(temp).toBe(0.7);
      expect(options).toBeDefined();
    });

    it('standard models should have temperature but no reasoning options', () => {
      const model = HARDCODED_MODELS.find(m => m.id === 'openai/gpt-4o');
      expect(model, 'Model openai/gpt-4o not found').toBeDefined();

      const temp = buildTemperatureConfig(model, 0.7);
      const options = buildReasoningProviderOptions(model);

      expect(temp).toBe(0.7);
      expect(options).toBeUndefined();
    });
  });

  // ============================================================================
  // Edge Cases and Robustness
  // ============================================================================
  describe('edge cases and robustness', () => {
    it('should handle all high variants of reasoning models', () => {
      const highVariants = [
        'openai/o3-mini-high',
        'openai/o4-mini-high',
      ];

      for (const modelId of highVariants) {
        const model = HARDCODED_MODELS.find(m => m.id === modelId);
        expect(model, `Model ${modelId} not found`).toBeDefined();

        const options = buildReasoningProviderOptions(model);
        expect(options).toBeDefined();
        expect(options!.openrouter.reasoning.effort).toBe('medium');
      }
    });

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
    it('should have consistent configuration for all OpenAI reasoning models', () => {
      const openaiReasoningModels = HARDCODED_MODELS.filter(
        m => m.id.startsWith('openai/o') && m.is_reasoning_model,
      );

      expect(openaiReasoningModels.length).toBeGreaterThan(0);

      for (const model of openaiReasoningModels) {
        // All OpenAI reasoning models should not support temperature
        expect(model.supports_temperature, `${model.id} should not support temperature`).toBe(false);

        // o1 should not stream, others should
        const isO1 = model.id === 'openai/o1';
        expect(
          model.supports_reasoning_stream,
          `${model.id} should ${isO1 ? 'not' : ''} support reasoning stream`,
        ).toBe(!isO1);
      }
    });

    it('should correctly configure all reasoning models in the catalog', () => {
      const reasoningModels = HARDCODED_MODELS.filter(m => m.is_reasoning_model);

      expect(reasoningModels.length).toBeGreaterThan(0);

      for (const model of reasoningModels) {
        // Each reasoning model should have explicit supports_reasoning_stream config
        expect(typeof model.supports_reasoning_stream).toBe('boolean');

        const options = buildReasoningProviderOptions(model);

        // Only models that stream reasoning should get options
        const shouldHaveOptions = model.supports_reasoning_stream;
        const optionsDefined = options !== undefined;
        expect(optionsDefined, `Model ${model.id} options defined mismatch`).toBe(shouldHaveOptions);
      }
    });
  });
});
