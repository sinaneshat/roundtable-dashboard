/**
 * Model Capabilities Service Tests
 *
 * Tests model capability validation, quality ratings, and error handling.
 */

import { describe, expect, it } from 'vitest';

import {
  getModelCapabilities,
  getRecommendedStructuredOutputModels,
  supportsCapability,
  validateModelForOperation,
  validateStructuredOutputSupport,
} from '../model-capabilities.service';

describe('model-capabilities.service', () => {
  describe('getModelCapabilities', () => {
    it('should return excellent JSON quality for Claude Sonnet 4.5', () => {
      const capabilities = getModelCapabilities('anthropic/claude-sonnet-4.5');

      expect(capabilities.structuredOutput).toBe(true);
      expect(capabilities.streaming).toBe(true);
      expect(capabilities.jsonModeQuality).toBe('excellent');
      expect(capabilities.knownIssues).toBeUndefined();
    });

    it('should return good JSON quality for GPT-4o', () => {
      const capabilities = getModelCapabilities('openai/gpt-4o');

      expect(capabilities.structuredOutput).toBe(true);
      expect(capabilities.jsonModeQuality).toBe('good');
    });

    it('should return good JSON quality for DeepSeek models', () => {
      const capabilities = getModelCapabilities('deepseek/deepseek-chat-v3.1');

      expect(capabilities.structuredOutput).toBe(true);
      expect(capabilities.jsonModeQuality).toBe('good');
    });

    it('should return good JSON quality for Gemini models', () => {
      const capabilities = getModelCapabilities('google/gemini-2.5-flash');

      expect(capabilities.structuredOutput).toBe(true);
      expect(capabilities.jsonModeQuality).toBe('good');
    });

    it('should return safe defaults for unknown models', () => {
      const capabilities = getModelCapabilities('unknown/model-xyz' as never);

      expect(capabilities.structuredOutput).toBe(false);
      expect(capabilities.streaming).toBe(false);
      expect(capabilities.jsonModeQuality).toBe('poor');
      expect(capabilities.knownIssues).toContain('Unknown model - capabilities not verified');
    });
  });

  describe('supportsCapability', () => {
    it('should return true for supported capabilities', () => {
      expect(supportsCapability('anthropic/claude-sonnet-4.5', 'structuredOutput')).toBe(true);
      expect(supportsCapability('anthropic/claude-sonnet-4.5', 'streaming')).toBe(true);
      expect(supportsCapability('anthropic/claude-sonnet-4.5', 'functionCalling')).toBe(true);
      expect(supportsCapability('anthropic/claude-sonnet-4.5', 'vision')).toBe(true);
    });

    it('should return false for models without vision support', () => {
      expect(supportsCapability('deepseek/deepseek-chat', 'vision')).toBe(false);
      expect(supportsCapability('meta-llama/llama-3.3-70b-instruct', 'vision')).toBe(false);
    });

    it('should return false for unknown models', () => {
      expect(supportsCapability('unknown/model', 'structuredOutput')).toBe(false);
      expect(supportsCapability('unknown/model', 'streaming')).toBe(false);
    });
  });

  describe('validateStructuredOutputSupport', () => {
    it('should NOT throw for models with excellent JSON quality', () => {
      expect(() => {
        validateStructuredOutputSupport('anthropic/claude-sonnet-4.5');
      }).not.toThrow();
    });

    it('should NOT throw for models with good JSON quality', () => {
      expect(() => {
        validateStructuredOutputSupport('openai/gpt-4o');
      }).not.toThrow();
    });

    it('should NOT throw for DeepSeek models (good quality)', () => {
      expect(() => {
        validateStructuredOutputSupport('deepseek/deepseek-chat-v3.1');
      }).not.toThrow();

      expect(() => {
        validateStructuredOutputSupport('deepseek/deepseek-chat');
      }).not.toThrow();
    });

    it('should throw for models without structured output support', () => {
      expect(() => {
        validateStructuredOutputSupport('unknown/model');
      }).toThrow('does not support structured output');
    });
  });

  describe('validateModelForOperation', () => {
    it('should NOT throw when all requirements are met', () => {
      expect(() => {
        validateModelForOperation('anthropic/claude-sonnet-4.5', 'test-operation', {
          structuredOutput: true,
          streaming: true,
          minJsonQuality: 'excellent',
        });
      }).not.toThrow();
    });

    it('should throw when structured output is required but not supported', () => {
      expect(() => {
        validateModelForOperation('unknown/model', 'test-operation', {
          structuredOutput: true,
        });
      }).toThrow('does not meet requirements');
    });

    it('should throw when streaming is required but not supported', () => {
      expect(() => {
        validateModelForOperation('unknown/model', 'test-operation', {
          streaming: true,
        });
      }).toThrow('does not meet requirements');
    });

    it('should throw when JSON quality is below minimum', () => {
      expect(() => {
        validateModelForOperation('openai/gpt-4o', 'critical-operation', {
          minJsonQuality: 'excellent',
        });
      }).toThrow('does not meet requirements');
    });

    it('should NOT throw when JSON quality meets minimum (good >= good)', () => {
      expect(() => {
        validateModelForOperation('openai/gpt-4o', 'test-operation', {
          minJsonQuality: 'good',
        });
      }).not.toThrow();
    });

    it('should NOT throw when JSON quality exceeds minimum (excellent >= good)', () => {
      expect(() => {
        validateModelForOperation('anthropic/claude-sonnet-4.5', 'test-operation', {
          minJsonQuality: 'good',
        });
      }).not.toThrow();
    });

    it('should include operation name in error message', () => {
      expect(() => {
        validateModelForOperation('unknown/model', 'web-search-generation', {
          structuredOutput: true,
        });
      }).toThrow('web-search-generation');
    });
  });

  describe('getRecommendedStructuredOutputModels', () => {
    it('should return list of models with good or excellent JSON quality', () => {
      const recommended = getRecommendedStructuredOutputModels();

      expect(recommended.length).toBeGreaterThan(0);

      // Check some expected models are included
      expect(recommended).toContain('anthropic/claude-sonnet-4.5');
      expect(recommended).toContain('openai/gpt-4o');
      expect(recommended).toContain('google/gemini-2.5-flash');
    });

    it('should include all models since they all have good or excellent quality', () => {
      const recommended = getRecommendedStructuredOutputModels();

      // DeepSeek models should now be included (good quality)
      expect(recommended).toContain('deepseek/deepseek-chat-v3.1');
      expect(recommended).toContain('deepseek/deepseek-chat');
    });
  });

  describe('model Quality Matrix', () => {
    const excellentModels = [
      'anthropic/claude-sonnet-4.5',
      'anthropic/claude-sonnet-4',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3.7-sonnet',
      'anthropic/claude-opus-4.5',
      'anthropic/claude-opus-4',
      'google/gemini-3-pro-preview-20251117',
    ];

    const goodModels = [
      'openai/chatgpt-4o-latest',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'openai/gpt-4.1-mini',
      'google/gemini-2.5-flash',
      'google/gemini-2.5-flash-lite',
      'google/gemini-2.0-pro',
      'google/gemini-2.0-flash',
      'deepseek/deepseek-chat-v3.1',
      'deepseek/deepseek-chat',
      'meta-llama/llama-3.3-70b-instruct',
      'x-ai/grok-4',
      'x-ai/grok-4-fast',
    ];

    excellentModels.forEach((model) => {
      it(`should classify ${model} as excellent`, () => {
        const capabilities = getModelCapabilities(model);
        expect(capabilities.jsonModeQuality).toBe('excellent');
        expect(capabilities.structuredOutput).toBe(true);
      });
    });

    goodModels.forEach((model) => {
      it(`should classify ${model} as good`, () => {
        const capabilities = getModelCapabilities(model);
        expect(capabilities.jsonModeQuality).toBe('good');
        expect(capabilities.structuredOutput).toBe(true);
      });
    });
  });

  describe('error Context Validation', () => {
    it('should provide detailed error context when validation fails', () => {
      let errorThrown = false;
      let errorMessage = '';

      try {
        validateModelForOperation('unknown/unknown-model', 'critical-search', {
          structuredOutput: true,
          minJsonQuality: 'excellent',
        });
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : '';
      }

      expect(errorThrown).toBe(true);
      expect(errorMessage).toContain('unknown/unknown-model');
      expect(errorMessage).toContain('critical-search');
      expect(errorMessage).toContain('does not meet requirements');
    });
  });

  describe('model Selection for Operations', () => {
    it('should allow Claude Sonnet 4.5 for all critical operations', () => {
      const model = 'anthropic/claude-sonnet-4.5';

      expect(() => {
        validateModelForOperation(model, 'web-search-generation', {
          structuredOutput: true,
          streaming: true,
          minJsonQuality: 'excellent',
        });
      }).not.toThrow();

      expect(() => {
        validateModelForOperation(model, 'analysis-generation', {
          structuredOutput: true,
          streaming: true,
          minJsonQuality: 'excellent',
        });
      }).not.toThrow();
    });

    it('should block non-excellent models for excellent quality requirements', () => {
      const model = 'openai/gpt-4o';

      expect(() => {
        validateModelForOperation(model, 'critical-operation', {
          minJsonQuality: 'excellent',
        });
      }).toThrow();
    });

    it('should allow GPT-4o for good quality requirements', () => {
      const model = 'openai/gpt-4o';

      expect(() => {
        validateModelForOperation(model, 'standard-operation', {
          minJsonQuality: 'good',
        });
      }).not.toThrow();
    });
  });
});
