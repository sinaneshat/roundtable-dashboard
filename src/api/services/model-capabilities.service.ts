/**
 * Model Capabilities Service
 *
 * ✅ SINGLE SOURCE OF TRUTH: Model capability definitions and validation
 * ✅ PREVENTS ERRORS: Validates models support required features before use
 * ✅ TYPE-SAFE: Zod schemas for capability definitions
 *
 * Purpose: Prevent AI_NoObjectGeneratedError by validating model capabilities
 * before attempting structured output generation.
 */

import { z } from 'zod';

import { createError } from '@/api/common/error-handling';

// ============================================================================
// CAPABILITY DEFINITIONS
// ============================================================================

// ============================================================================
// JSON MODE QUALITY ENUM - 5-Part Pattern
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const JSON_MODE_QUALITIES = ['excellent', 'good', 'fair', 'poor'] as const;

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const JsonModeQualitySchema = z.enum(JSON_MODE_QUALITIES);

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type JsonModeQuality = z.infer<typeof JsonModeQualitySchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const JsonModeQualities = {
  EXCELLENT: 'excellent' as const,
  GOOD: 'good' as const,
  FAIR: 'fair' as const,
  POOR: 'poor' as const,
} as const;

/**
 * Quality order for comparison (higher number = better quality)
 */
const JSON_QUALITY_ORDER: Record<JsonModeQuality, number> = {
  excellent: 3,
  good: 2,
  fair: 1,
  poor: 0,
} as const;

/**
 * Model capability flags
 */
export const ModelCapabilitiesSchema = z.object({
  /** Supports structured JSON output (streamObject/generateObject) */
  structuredOutput: z.boolean(),
  /** Supports streaming responses */
  streaming: z.boolean(),
  /** Supports function calling */
  functionCalling: z.boolean(),
  /** Supports vision/image inputs */
  vision: z.boolean(),
  /** Recommended for JSON mode operations */
  jsonModeQuality: JsonModeQualitySchema,
  /** Known issues or limitations */
  knownIssues: z.array(z.string()).optional(),
});

export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;

// ============================================================================
// MODEL CAPABILITY DATABASE
// ============================================================================

/**
 * Known model capabilities
 *
 * ✅ MAINTAINED: Update when adding new models
 * ✅ PREVENTS ERRORS: Blocks unsupported operations at runtime
 */
const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // Claude Models (Excellent JSON mode support)
  'anthropic/claude-sonnet-4.5': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.EXCELLENT,
  },
  'anthropic/claude-sonnet-4': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.EXCELLENT,
  },
  'anthropic/claude-3.5-sonnet': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.EXCELLENT,
  },
  'anthropic/claude-opus-4': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
    knownIssues: ['Occasional JSON mode issues through OpenRouter'],
  },
  'anthropic/claude-3.7-sonnet': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.EXCELLENT,
  },

  // GPT Models (Good JSON mode support)
  'openai/chatgpt-4o-latest': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'openai/gpt-4o': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'openai/gpt-4o-mini': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },

  // Gemini Models (Good JSON mode support)
  'google/gemini-2.5-flash': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'google/gemini-2.0-pro': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'google/gemini-2.0-flash': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: false,
    jsonModeQuality: JsonModeQualities.GOOD,
  },

  // DeepSeek Models (Fair to Poor JSON mode support)
  'deepseek/deepseek-chat-v3.1': {
    structuredOutput: true,
    streaming: true,
    functionCalling: false,
    vision: false,
    jsonModeQuality: JsonModeQualities.FAIR,
    knownIssues: [
      'Inconsistent JSON schema compliance',
      'May fail with complex nested schemas',
      'Not recommended for critical structured output',
    ],
  },
  'deepseek/deepseek-chat': {
    structuredOutput: true,
    streaming: true,
    functionCalling: false,
    vision: false,
    jsonModeQuality: JsonModeQualities.POOR,
    knownIssues: [
      'Frequent schema validation failures',
      'Not recommended for structured output',
    ],
  },

  // Other Models
  'meta-llama/llama-3.3-70b-instruct': {
    structuredOutput: true,
    streaming: true,
    functionCalling: false,
    vision: false,
    jsonModeQuality: JsonModeQualities.FAIR,
  },
  'mistralai/mistral-large': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: false,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
};

// ============================================================================
// CAPABILITY VALIDATION
// ============================================================================

/**
 * Get capabilities for a model
 *
 * @param modelId - Model ID to check (accepts any string for unknown model handling)
 * @returns Model capabilities or default safe capabilities
 */
export function getModelCapabilities(modelId: string): ModelCapabilities {
  const capabilities = MODEL_CAPABILITIES[modelId];

  if (!capabilities) {
    // Default to safe capabilities for unknown models
    return {
      structuredOutput: false,
      streaming: false,
      functionCalling: false,
      vision: false,
      jsonModeQuality: JsonModeQualities.POOR,
      knownIssues: ['Unknown model - capabilities not verified'],
    };
  }

  return capabilities;
}

/**
 * Check if a model supports a specific capability
 *
 * @param modelId - Model ID to check (accepts any string)
 * @param capability - Capability to verify
 * @returns True if model supports the capability
 */
export function supportsCapability(
  modelId: string,
  capability: keyof Omit<ModelCapabilities, 'jsonModeQuality' | 'knownIssues'>,
): boolean {
  const capabilities = getModelCapabilities(modelId);
  return capabilities[capability];
}

/**
 * Validate model supports structured output with good quality
 *
 * @param modelId - Model ID to validate (accepts any string)
 * @throws HttpException if model doesn't support structured output adequately
 */
export function validateStructuredOutputSupport(modelId: string): void {
  const capabilities = getModelCapabilities(modelId);

  if (!capabilities.structuredOutput) {
    throw createError.badRequest(
      `Model ${modelId} does not support structured output`,
      {
        errorType: 'validation',
        field: 'modelId',
      },
    );
  }

  if (capabilities.jsonModeQuality === JsonModeQualities.POOR) {
    throw createError.badRequest(
      `Model ${modelId} has poor JSON mode quality and is not recommended for structured output`,
      {
        errorType: 'validation',
        field: 'modelId',
      },
    );
  }

  // Note: Fair quality models are allowed but may have issues
  // Known issues are already documented in capabilities.knownIssues
}

/**
 * Get recommended models for structured output
 *
 * @returns List of model IDs with excellent or good JSON mode quality
 */
export function getRecommendedStructuredOutputModels(): string[] {
  return Object.entries(MODEL_CAPABILITIES)
    .filter(([_, caps]) =>
      caps.jsonModeQuality === JsonModeQualities.EXCELLENT
      || caps.jsonModeQuality === JsonModeQualities.GOOD,
    )
    .map(([modelId]) => modelId);
}

/**
 * Validate operation with detailed error context
 *
 * @param modelId - Model to use (accepts any string)
 * @param operation - Operation name (for logging)
 * @param requiredCapabilities - Required capabilities for this operation
 * @param requiredCapabilities.structuredOutput - Whether structured output is required
 * @param requiredCapabilities.streaming - Whether streaming is required
 * @param requiredCapabilities.functionCalling - Whether function calling is required
 * @param requiredCapabilities.vision - Whether vision is required
 * @param requiredCapabilities.minJsonQuality - Minimum JSON quality level required
 * @throws HttpException with detailed error if model doesn't meet requirements
 */
export function validateModelForOperation(
  modelId: string,
  operation: string,
  requiredCapabilities: {
    structuredOutput?: boolean;
    streaming?: boolean;
    functionCalling?: boolean;
    vision?: boolean;
    minJsonQuality?: 'excellent' | 'good' | 'fair';
  },
): void {
  const capabilities = getModelCapabilities(modelId);
  const issues: string[] = [];

  if (requiredCapabilities.structuredOutput && !capabilities.structuredOutput) {
    issues.push('Model does not support structured output');
  }

  if (requiredCapabilities.streaming && !capabilities.streaming) {
    issues.push('Model does not support streaming');
  }

  if (requiredCapabilities.functionCalling && !capabilities.functionCalling) {
    issues.push('Model does not support function calling');
  }

  if (requiredCapabilities.vision && !capabilities.vision) {
    issues.push('Model does not support vision inputs');
  }

  if (requiredCapabilities.minJsonQuality) {
    const requiredLevel = JSON_QUALITY_ORDER[requiredCapabilities.minJsonQuality];
    const modelLevel = JSON_QUALITY_ORDER[capabilities.jsonModeQuality];

    if (modelLevel < requiredLevel) {
      issues.push(
        `Model JSON quality (${capabilities.jsonModeQuality}) is below required level (${requiredCapabilities.minJsonQuality})`,
      );
    }
  }

  if (issues.length > 0) {
    throw createError.badRequest(
      `Model ${modelId} does not meet requirements for ${operation}. Issues: ${issues.join(', ')}`,
      {
        errorType: 'validation',
        field: 'modelId',
      },
    );
  }

  // Note: Known issues are documented in capabilities.knownIssues
  // Callers should check this field if they need to handle model-specific quirks
}
