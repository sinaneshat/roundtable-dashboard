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

    it('should return fair JSON quality for DeepSeek V3.1 with known issues', () => {
      const capabilities = getModelCapabilities('deepseek/deepseek-chat-v3.1');

      expect(capabilities.structuredOutput).toBe(true);
      expect(capabilities.jsonModeQuality).toBe('fair');
      expect(capabilities.knownIssues).toContain('Inconsistent JSON schema compliance');
    });

    it('should return poor JSON quality for DeepSeek Chat', () => {
      const capabilities = getModelCapabilities('deepseek/deepseek-chat');

      expect(capabilities.structuredOutput).toBe(true);
      expect(capabilities.jsonModeQuality).toBe('poor');
      expect(capabilities.knownIssues).toContain('Frequent schema validation failures');
    });

    it('should return safe defaults for unknown models', () => {
      // Using string literal to test unknown model handling
      // Type assertion is acceptable here as we're testing error handling paths
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

    it('should return false for unsupported capabilities', () => {
      expect(supportsCapability('deepseek/deepseek-chat', 'functionCalling')).toBe(false);
      expect(supportsCapability('deepseek/deepseek-chat', 'vision')).toBe(false);
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

    it('should NOT throw but log warning for models with fair JSON quality', () => {
      // Fair quality models are allowed but warned about
      expect(() => {
        validateStructuredOutputSupport('deepseek/deepseek-chat-v3.1');
      }).not.toThrow();
    });

    it('should throw for models with poor JSON quality', () => {
      expect(() => {
        validateStructuredOutputSupport('deepseek/deepseek-chat');
      }).toThrow('has poor JSON mode quality');
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
        validateModelForOperation('deepseek/deepseek-chat-v3.1', 'critical-operation', {
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

    it('should NOT include models with fair or poor JSON quality', () => {
      const recommended = getRecommendedStructuredOutputModels();

      expect(recommended).not.toContain('deepseek/deepseek-chat-v3.1'); // fair
      expect(recommended).not.toContain('deepseek/deepseek-chat'); // poor
    });
  });

  describe('model Quality Matrix', () => {
    const testCases = [
      // Excellent models
      { model: 'anthropic/claude-sonnet-4.5', expectedQuality: 'excellent', expectStructuredOutput: true },
      { model: 'anthropic/claude-sonnet-4', expectedQuality: 'excellent', expectStructuredOutput: true },
      { model: 'anthropic/claude-3.5-sonnet', expectedQuality: 'excellent', expectStructuredOutput: true },
      { model: 'anthropic/claude-3.7-sonnet', expectedQuality: 'excellent', expectStructuredOutput: true },

      // Good models
      { model: 'openai/chatgpt-4o-latest', expectedQuality: 'good', expectStructuredOutput: true },
      { model: 'openai/gpt-4o', expectedQuality: 'good', expectStructuredOutput: true },
      { model: 'google/gemini-2.5-flash', expectedQuality: 'good', expectStructuredOutput: true },
      { model: 'google/gemini-2.0-pro', expectedQuality: 'good', expectStructuredOutput: true },

      // Fair models
      { model: 'deepseek/deepseek-chat-v3.1', expectedQuality: 'fair', expectStructuredOutput: true },
      { model: 'meta-llama/llama-3.3-70b-instruct', expectedQuality: 'fair', expectStructuredOutput: true },

      // Poor models
      { model: 'deepseek/deepseek-chat', expectedQuality: 'poor', expectStructuredOutput: true },
    ];

    testCases.forEach(({ model, expectedQuality, expectStructuredOutput }) => {
      it(`should classify ${model} as ${expectedQuality} with structuredOutput=${expectStructuredOutput}`, () => {
        const capabilities = getModelCapabilities(model);

        expect(capabilities.jsonModeQuality).toBe(expectedQuality);
        expect(capabilities.structuredOutput).toBe(expectStructuredOutput);
      });
    });
  });

  describe('error Context Validation', () => {
    it('should provide detailed error context when validation fails', () => {
      let errorThrown = false;
      let errorMessage = '';

      try {
        validateModelForOperation('deepseek/deepseek-chat', 'critical-search', {
          minJsonQuality: 'excellent',
        });
      } catch (error) {
        errorThrown = true;
        errorMessage = error instanceof Error ? error.message : '';
      }

      expect(errorThrown).toBe(true);
      expect(errorMessage).toContain('deepseek/deepseek-chat');
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

    it('should block DeepSeek models for excellent quality requirements', () => {
      const model = 'deepseek/deepseek-chat-v3.1';

      expect(() => {
        validateModelForOperation(model, 'critical-operation', {
          minJsonQuality: 'excellent',
        });
      }).toThrow();
    });

    it('should allow DeepSeek V3.1 for fair quality requirements', () => {
      const model = 'deepseek/deepseek-chat-v3.1';

      expect(() => {
        validateModelForOperation(model, 'non-critical-operation', {
          minJsonQuality: 'fair',
        });
      }).not.toThrow();
    });
  });
});
