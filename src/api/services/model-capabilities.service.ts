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
 * ✅ ALL MODELS with vision/non-vision capabilities
 * ✅ PREVENTS ERRORS: Blocks unsupported operations at runtime
 */
const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // ========== ANTHROPIC CLAUDE (6) - All support vision ==========
  'anthropic/claude-opus-4.5': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.EXCELLENT,
  },
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
    jsonModeQuality: JsonModeQualities.EXCELLENT,
  },
  'anthropic/claude-3.7-sonnet': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.EXCELLENT,
  },
  'anthropic/claude-3.5-haiku': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'anthropic/claude-haiku-4.5': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },

  // ========== OPENAI GPT (5) ==========
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
  'openai/gpt-4.1-mini': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: false,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'openai/o3-mini': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: false,
    jsonModeQuality: JsonModeQualities.EXCELLENT,
  },

  // ========== GOOGLE GEMINI (7) ==========
  'google/gemini-3-pro-preview-20251117': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.EXCELLENT,
  },
  'google/gemini-2.5-pro': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.EXCELLENT,
  },
  'google/gemini-2.5-flash': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'google/gemini-2.5-flash-lite': {
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
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'google/gemini-2.0-flash-001': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'google/gemini-2.0-flash-exp': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },

  // ========== XAI GROK (4) ==========
  'x-ai/grok-4': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'x-ai/grok-4-fast': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'x-ai/grok-4.1-fast': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'x-ai/grok-code-fast-1': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: false,
    jsonModeQuality: JsonModeQualities.GOOD,
  },

  // ========== DEEPSEEK (6) - Text only ==========
  'deepseek/deepseek-chat-v3.1': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: false,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'deepseek/deepseek-chat': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: false,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'deepseek/deepseek-r1': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: false,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'deepseek/deepseek-r1-0528': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: false,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'deepseek/deepseek-chat-v3-0324': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: false,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  // ========== META LLAMA (3) ==========
  'meta-llama/llama-3.3-70b-instruct': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: false,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'meta-llama/llama-4-maverick-17b-128e-instruct': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'meta-llama/llama-4-scout-17b-16e-instruct': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },

  // ========== MISTRAL (2) ==========
  'mistralai/mistral-large': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: false,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'mistralai/mistral-small-3.1-24b-instruct-2503': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: true,
    jsonModeQuality: JsonModeQualities.GOOD,
  },

  // ========== NVIDIA (1) ==========
  'nvidia/nemotron-nano-9b-v2': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: false,
    jsonModeQuality: JsonModeQualities.FAIR,
  },

  // ========== QWEN (3) - Text only ==========
  'qwen/qwen3-32b': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: false,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'qwen/qwen3-max': {
    structuredOutput: true,
    streaming: true,
    functionCalling: true,
    vision: false,
    jsonModeQuality: JsonModeQualities.GOOD,
  },
  'qwen/qwen3-coder-plus': {
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
  // Try exact match first
  let capabilities = MODEL_CAPABILITIES[modelId];

  // If not found and has :free suffix, try base model (free variants have same capabilities)
  if (!capabilities && modelId.endsWith(':free')) {
    const baseModelId = modelId.replace(/:free$/, '');
    capabilities = MODEL_CAPABILITIES[baseModelId];
  }

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
