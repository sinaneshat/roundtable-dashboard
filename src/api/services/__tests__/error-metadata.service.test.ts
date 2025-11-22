/**
 * Error Metadata Service Tests
 *
 * Tests for extractErrorMetadata function, specifically the reasoning parameter fix
 * for o1/o3 models that output content as reasoning instead of text.
 *
 * Bug fixed: o1/o3 models put content in reasoning instead of text, causing false empty_response errors.
 * Fix: Added reasoning parameter to check both text AND reasoning for content.
 *
 * @module api/services/__tests__/error-metadata.service.test
 */

import { describe, expect, it } from 'vitest';

import {
  buildEmptyResponseError,
  categorizeError,
  extractErrorMetadata,
  extractProviderError,
  isTransientError,
} from '../error-metadata.service';

describe('extractErrorMetadata', () => {
  // ============================================================================
  // o1/o3 Model Reasoning Parameter Fix
  // ============================================================================
  describe('o1/o3 model reasoning parameter fix', () => {
    it('should NOT mark as error when text is empty but reasoning has content', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50 },
        text: '',
        reasoning: 'This is the reasoning content from o1/o3 model',
      });

      expect(result.hasError).toBe(false);
      expect(result.isTransientError).toBe(false);
      expect(result.isPartialResponse).toBe(false);
      expect(result.errorCategory).toBeUndefined();
    });

    it('should NOT mark as error when text is whitespace-only but reasoning has content', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50 },
        text: '   \n\t  ',
        reasoning: 'Valid reasoning content',
      });

      expect(result.hasError).toBe(false);
      expect(result.isTransientError).toBe(false);
      expect(result.isPartialResponse).toBe(false);
    });

    it('should NOT mark as error when both text and reasoning have content', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 100 },
        text: 'Regular text content',
        reasoning: 'Additional reasoning content',
      });

      expect(result.hasError).toBe(false);
      expect(result.isTransientError).toBe(false);
      expect(result.isPartialResponse).toBe(false);
    });

    it('should handle undefined reasoning gracefully', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50 },
        text: 'Valid text content',
        reasoning: undefined,
      });

      expect(result.hasError).toBe(false);
      expect(result.isTransientError).toBe(false);
      expect(result.isPartialResponse).toBe(false);
    });

    it('should handle missing reasoning parameter gracefully', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50 },
        text: 'Valid text content',
      });

      expect(result.hasError).toBe(false);
      expect(result.isTransientError).toBe(false);
      expect(result.isPartialResponse).toBe(false);
    });
  });

  // ============================================================================
  // Normal Model Scenarios
  // ============================================================================
  describe('normal model scenarios', () => {
    it('should NOT mark as error when text has content (no reasoning)', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50 },
        text: 'This is the response text',
      });

      expect(result.hasError).toBe(false);
      expect(result.isTransientError).toBe(false);
      expect(result.isPartialResponse).toBe(false);
    });

    it('should NOT mark as error with valid text content and zero output tokens', () => {
      // Edge case: Some models may not report tokens correctly
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 0 },
        text: 'Generated text content',
      });

      expect(result.hasError).toBe(false);
      expect(result.isTransientError).toBe(false);
      expect(result.isPartialResponse).toBe(false);
    });
  });

  // ============================================================================
  // Actual Empty Response Scenarios
  // ============================================================================
  describe('actual empty response scenarios', () => {
    it('should mark as error when both text and reasoning are empty with zero tokens', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 0 },
        text: '',
        reasoning: '',
      });

      expect(result.hasError).toBe(true);
      expect(result.errorCategory).toBe('content_filter');
      expect(result.isTransientError).toBe(false);
      expect(result.isPartialResponse).toBe(false);
    });

    it('should mark as error when text and reasoning are whitespace-only with zero tokens', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 0 },
        text: '   \n\t  ',
        reasoning: '   ',
      });

      expect(result.hasError).toBe(true);
      expect(result.errorCategory).toBe('content_filter');
      expect(result.isTransientError).toBe(false);
      expect(result.isPartialResponse).toBe(false);
    });

    it('should mark as error when text is empty and reasoning is undefined', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 0 },
        text: '',
        reasoning: undefined,
      });

      expect(result.hasError).toBe(true);
      expect(result.errorCategory).toBe('content_filter');
      expect(result.isTransientError).toBe(false);
    });

    it('should mark empty response with failed finish reason as transient', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'failed',
        usage: { inputTokens: 100, outputTokens: 0 },
        text: '',
        reasoning: '',
      });

      expect(result.hasError).toBe(true);
      expect(result.errorCategory).toBe('provider_error');
      expect(result.isTransientError).toBe(true);
    });

    it('should mark empty response with other finish reason as transient', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'other',
        usage: { inputTokens: 100, outputTokens: 0 },
        text: '',
        reasoning: '',
      });

      expect(result.hasError).toBe(true);
      expect(result.errorCategory).toBe('provider_error');
      expect(result.isTransientError).toBe(true);
    });

    it('should mark empty response with length finish reason as transient', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'length',
        usage: { inputTokens: 100, outputTokens: 0 },
        text: '',
        reasoning: '',
      });

      expect(result.hasError).toBe(true);
      expect(result.errorCategory).toBe('provider_error');
      expect(result.isTransientError).toBe(true);
    });

    it('should mark empty response with content-filter finish reason as not transient', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'content-filter',
        usage: { inputTokens: 100, outputTokens: 0 },
        text: '',
        reasoning: '',
      });

      expect(result.hasError).toBe(true);
      expect(result.errorCategory).toBe('content_filter');
      expect(result.isTransientError).toBe(false);
    });
  });

  // ============================================================================
  // Partial Response with Reasoning
  // ============================================================================
  describe('partial response with reasoning', () => {
    it('should mark as partial response when error occurs but reasoning was generated', () => {
      const result = extractErrorMetadata({
        providerMetadata: { error: 'Rate limit exceeded' },
        response: {},
        finishReason: 'failed',
        usage: { inputTokens: 100, outputTokens: 50 },
        text: '',
        reasoning: 'Some reasoning was generated before error',
      });

      expect(result.hasError).toBe(true);
      expect(result.isPartialResponse).toBe(true);
      expect(result.errorCategory).toBe('rate_limit');
    });

    it('should mark as partial response when error occurs but text was generated', () => {
      const result = extractErrorMetadata({
        providerMetadata: { error: 'Connection timeout' },
        response: {},
        finishReason: 'failed',
        usage: { inputTokens: 100, outputTokens: 50 },
        text: 'Partial text content',
        reasoning: '',
      });

      expect(result.hasError).toBe(true);
      expect(result.isPartialResponse).toBe(true);
      expect(result.errorCategory).toBe('network');
    });

    it('should mark as partial response when error occurs and both text and reasoning generated', () => {
      const result = extractErrorMetadata({
        providerMetadata: { error: 'Provider error occurred' },
        response: {},
        finishReason: 'failed',
        usage: { inputTokens: 100, outputTokens: 100 },
        text: 'Some text',
        reasoning: 'Some reasoning',
      });

      expect(result.hasError).toBe(true);
      expect(result.isPartialResponse).toBe(true);
      expect(result.errorCategory).toBe('provider_error');
    });

    it('should mark as partial response based on output tokens even without text/reasoning', () => {
      const result = extractErrorMetadata({
        providerMetadata: { error: 'Model not found' },
        response: {},
        finishReason: 'failed',
        usage: { inputTokens: 100, outputTokens: 25 },
        text: '',
        reasoning: '',
      });

      expect(result.hasError).toBe(true);
      expect(result.isPartialResponse).toBe(true);
      expect(result.errorCategory).toBe('model_not_found');
    });
  });

  // ============================================================================
  // Provider Error Detection
  // ============================================================================
  describe('provider error detection', () => {
    it('should detect error from providerMetadata.error string', () => {
      const result = extractErrorMetadata({
        providerMetadata: { error: 'Rate limit exceeded' },
        response: {},
        finishReason: 'failed',
        usage: { inputTokens: 100, outputTokens: 0 },
        text: '',
        reasoning: '',
      });

      expect(result.hasError).toBe(true);
      expect(result.openRouterError).toBe('Rate limit exceeded');
      expect(result.errorCategory).toBe('rate_limit');
      expect(result.isTransientError).toBe(true);
    });

    it('should detect error from providerMetadata.error object', () => {
      const result = extractErrorMetadata({
        providerMetadata: { error: { message: 'Unauthorized access' } },
        response: {},
        finishReason: 'failed',
        usage: { inputTokens: 100, outputTokens: 0 },
        text: '',
        reasoning: '',
      });

      expect(result.hasError).toBe(true);
      expect(result.openRouterError).toBeTruthy();
      expect(result.errorCategory).toBe('authentication');
    });

    it('should detect error from providerMetadata.errorMessage', () => {
      const result = extractErrorMetadata({
        providerMetadata: { errorMessage: 'Invalid request validation' },
        response: {},
        finishReason: 'failed',
        usage: { inputTokens: 100, outputTokens: 0 },
        text: '',
        reasoning: '',
      });

      expect(result.hasError).toBe(true);
      expect(result.openRouterError).toBe('Invalid request validation');
      expect(result.errorCategory).toBe('validation');
    });

    it('should detect content filter from providerMetadata.moderation', () => {
      const result = extractErrorMetadata({
        providerMetadata: { moderation: { flagged: true } },
        response: {},
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 0 },
        text: '',
        reasoning: '',
      });

      expect(result.hasError).toBe(true);
      expect(result.errorCategory).toBe('content_filter');
      expect(result.isTransientError).toBe(false);
    });

    it('should detect content filter from providerMetadata.contentFilter', () => {
      const result = extractErrorMetadata({
        providerMetadata: { contentFilter: true },
        response: {},
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 0 },
        text: '',
        reasoning: '',
      });

      expect(result.hasError).toBe(true);
      expect(result.errorCategory).toBe('content_filter');
      expect(result.isTransientError).toBe(false);
    });

    it('should detect error from response.error', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: { error: 'Connection timeout' },
        finishReason: 'failed',
        usage: { inputTokens: 100, outputTokens: 0 },
        text: '',
        reasoning: '',
      });

      expect(result.hasError).toBe(true);
      expect(result.openRouterError).toBe('Connection timeout');
      expect(result.errorCategory).toBe('network');
      expect(result.isTransientError).toBe(true);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================
  describe('edge cases', () => {
    it('should handle null providerMetadata', () => {
      const result = extractErrorMetadata({
        providerMetadata: null,
        response: {},
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50 },
        text: 'Valid content',
        reasoning: '',
      });

      expect(result.hasError).toBe(false);
    });

    it('should handle null response', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: null,
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50 },
        text: 'Valid content',
        reasoning: '',
      });

      expect(result.hasError).toBe(false);
    });

    it('should handle missing usage gracefully with text content', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: undefined,
        text: 'Valid content',
        reasoning: '',
      });

      expect(result.hasError).toBe(false);
    });

    it('should handle missing usage gracefully with reasoning content', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: undefined,
        text: '',
        reasoning: 'Valid reasoning content',
      });

      expect(result.hasError).toBe(false);
    });

    it('should handle empty usage object', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: {},
        text: 'Valid content',
        reasoning: '',
      });

      expect(result.hasError).toBe(false);
    });

    it('should detect empty response when usage missing and no content', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: undefined,
        text: '',
        reasoning: '',
      });

      expect(result.hasError).toBe(true);
      expect(result.errorCategory).toBe('content_filter');
    });

    it('should handle undefined text parameter', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50 },
        text: undefined,
        reasoning: 'Valid reasoning',
      });

      expect(result.hasError).toBe(false);
    });

    it('should mark as error when both text and reasoning undefined with zero tokens', () => {
      const result = extractErrorMetadata({
        providerMetadata: {},
        response: {},
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 0 },
        text: undefined,
        reasoning: undefined,
      });

      expect(result.hasError).toBe(true);
      expect(result.errorCategory).toBe('content_filter');
    });
  });
});

// ============================================================================
// Supporting Functions Tests
// ============================================================================

describe('categorizeError', () => {
  it('should categorize model not found errors', () => {
    expect(categorizeError('Model not found')).toBe('model_not_found');
    expect(categorizeError('Model does not exist')).toBe('model_not_found');
  });

  it('should categorize content filter errors', () => {
    expect(categorizeError('Content filtered')).toBe('content_filter');
    expect(categorizeError('Safety check failed')).toBe('content_filter');
    expect(categorizeError('Moderation flagged')).toBe('content_filter');
  });

  it('should categorize rate limit errors', () => {
    expect(categorizeError('Rate limit exceeded')).toBe('rate_limit');
    expect(categorizeError('Quota exceeded')).toBe('rate_limit');
  });

  it('should categorize network errors', () => {
    expect(categorizeError('Connection timeout')).toBe('network');
    expect(categorizeError('Connection refused')).toBe('network');
  });

  it('should categorize authentication errors', () => {
    expect(categorizeError('Unauthorized')).toBe('authentication');
    expect(categorizeError('Authentication failed')).toBe('authentication');
  });

  it('should categorize validation errors', () => {
    expect(categorizeError('Invalid request')).toBe('validation');
    expect(categorizeError('Validation error')).toBe('validation');
  });

  it('should default to provider_error for unknown errors', () => {
    expect(categorizeError('Unknown error occurred')).toBe('provider_error');
    expect(categorizeError('Something went wrong')).toBe('provider_error');
  });

  it('should be case insensitive', () => {
    expect(categorizeError('RATE LIMIT EXCEEDED')).toBe('rate_limit');
    expect(categorizeError('Model Not Found')).toBe('model_not_found');
  });
});

describe('isTransientError', () => {
  it('should return false for undefined category', () => {
    expect(isTransientError(undefined, 'stop')).toBe(false);
  });

  it('should return true for provider_error', () => {
    expect(isTransientError('provider_error', 'stop')).toBe(true);
  });

  it('should return true for network errors', () => {
    expect(isTransientError('network', 'stop')).toBe(true);
  });

  it('should return true for rate_limit errors', () => {
    expect(isTransientError('rate_limit', 'stop')).toBe(true);
  });

  it('should return false for content_filter errors', () => {
    expect(isTransientError('content_filter', 'stop')).toBe(false);
  });

  it('should return false for authentication errors', () => {
    expect(isTransientError('authentication', 'stop')).toBe(false);
  });

  it('should return true for empty_response with non-stop finish reason', () => {
    expect(isTransientError('empty_response', 'failed')).toBe(true);
    expect(isTransientError('empty_response', 'other')).toBe(true);
  });

  it('should return false for empty_response with stop finish reason', () => {
    expect(isTransientError('empty_response', 'stop')).toBe(false);
  });
});

describe('buildEmptyResponseError', () => {
  it('should build content_filter error for stop finish reason', () => {
    const result = buildEmptyResponseError({
      inputTokens: 100,
      outputTokens: 0,
      finishReason: 'stop',
    });

    expect(result.hasError).toBe(true);
    expect(result.errorCategory).toBe('content_filter');
    expect(result.isTransientError).toBe(false);
    expect(result.isPartialResponse).toBe(false);
  });

  it('should build provider_error for length finish reason', () => {
    const result = buildEmptyResponseError({
      inputTokens: 100,
      outputTokens: 0,
      finishReason: 'length',
    });

    expect(result.hasError).toBe(true);
    expect(result.errorCategory).toBe('provider_error');
    expect(result.isTransientError).toBe(true);
  });

  it('should build content_filter for content-filter finish reason', () => {
    const result = buildEmptyResponseError({
      inputTokens: 100,
      outputTokens: 0,
      finishReason: 'content-filter',
    });

    expect(result.hasError).toBe(true);
    expect(result.errorCategory).toBe('content_filter');
    expect(result.isTransientError).toBe(false);
  });

  it('should build provider_error for failed finish reason', () => {
    const result = buildEmptyResponseError({
      inputTokens: 100,
      outputTokens: 0,
      finishReason: 'failed',
    });

    expect(result.hasError).toBe(true);
    expect(result.errorCategory).toBe('provider_error');
    expect(result.isTransientError).toBe(true);
  });

  it('should build empty_response for unknown finish reason', () => {
    const result = buildEmptyResponseError({
      inputTokens: 100,
      outputTokens: 0,
      finishReason: 'unknown',
    });

    expect(result.hasError).toBe(true);
    expect(result.errorCategory).toBe('empty_response');
    expect(result.isTransientError).toBe(true);
  });

  it('should include token statistics in providerMessage', () => {
    const result = buildEmptyResponseError({
      inputTokens: 150,
      outputTokens: 0,
      finishReason: 'stop',
    });

    expect(result.providerMessage).toContain('150');
    expect(result.providerMessage).toContain('0');
    expect(result.providerMessage).toContain('stop');
  });
});

describe('extractProviderError', () => {
  it('should extract error from string', () => {
    const result = extractProviderError({ error: 'Test error' }, {});
    expect(result.rawError).toBe('Test error');
    expect(result.category).toBe('provider_error');
  });

  it('should extract error from object', () => {
    const result = extractProviderError({ error: { message: 'Test' } }, {});
    expect(result.rawError).toBeTruthy();
    expect(result.rawError).toContain('message');
  });

  it('should extract errorMessage as fallback', () => {
    const result = extractProviderError({ errorMessage: 'Fallback error' }, {});
    expect(result.rawError).toBe('Fallback error');
  });

  it('should detect moderation flag', () => {
    const result = extractProviderError({ moderation: true }, {});
    expect(result.category).toBe('content_filter');
  });

  it('should detect contentFilter flag', () => {
    const result = extractProviderError({ contentFilter: true }, {});
    expect(result.category).toBe('content_filter');
  });

  it('should extract error from response if metadata empty', () => {
    const result = extractProviderError({}, { error: 'Response error' });
    expect(result.rawError).toBe('Response error');
  });

  it('should return empty result if no errors found', () => {
    const result = extractProviderError({}, {});
    expect(result.rawError).toBeUndefined();
    expect(result.category).toBeUndefined();
  });

  it('should handle non-object inputs', () => {
    const result = extractProviderError(null, null);
    expect(result.rawError).toBeUndefined();
    expect(result.category).toBeUndefined();
  });
});
