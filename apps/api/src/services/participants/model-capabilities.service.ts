import { z } from '@hono/zod-openapi';
import type { JsonModeQuality } from '@roundtable/shared/enums';
import { JsonModeQualities, JsonModeQualitySchema } from '@roundtable/shared/enums';

import { createError } from '@/common/error-handling';
import { getAllModels, getModelById } from '@/services/models';

// ============================================================================
// TYPES
// ============================================================================

export const ModelCapabilitiesSchema = z.object({
  structuredOutput: z.boolean(),
  streaming: z.boolean(),
  functionCalling: z.boolean(),
  vision: z.boolean(),
  jsonModeQuality: JsonModeQualitySchema,
  knownIssues: z.array(z.string()).optional(),
});

export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;

// ============================================================================
// CAPABILITY EXTRACTION
// ============================================================================

const JSON_QUALITY_ORDER: Record<JsonModeQuality, number> = {
  excellent: 3,
  good: 2,
  fair: 1,
  poor: 0,
} as const;

export function getModelCapabilities(modelId: string): ModelCapabilities {
  let model = getModelById(modelId);

  if (!model && modelId.endsWith(':free')) {
    const baseModelId = modelId.replace(/:free$/, '');
    model = getModelById(baseModelId);
  }

  if (!model) {
    return {
      structuredOutput: false,
      streaming: false,
      functionCalling: false,
      vision: false,
      jsonModeQuality: JsonModeQualities.POOR,
      knownIssues: ['Unknown model - capabilities not verified'],
    };
  }

  return {
    structuredOutput: model.capabilities.tools,
    streaming: model.capabilities.streaming,
    functionCalling: model.capabilities.tools,
    vision: model.capabilities.vision,
    jsonModeQuality: model.capabilities.tools
      ? (model.category === 'reasoning' ? JsonModeQualities.EXCELLENT : JsonModeQualities.GOOD)
      : JsonModeQualities.POOR,
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

export function supportsCapability(
  modelId: string,
  capability: keyof Omit<ModelCapabilities, 'jsonModeQuality' | 'knownIssues'>,
): boolean {
  const capabilities = getModelCapabilities(modelId);
  return capabilities[capability];
}

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
}

export function getRecommendedStructuredOutputModels(): string[] {
  const models = getAllModels();
  return models
    .filter((m) => {
      const caps = getModelCapabilities(m.id);
      return caps.jsonModeQuality === JsonModeQualities.EXCELLENT
        || caps.jsonModeQuality === JsonModeQualities.GOOD;
    })
    .map(m => m.id);
}

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
}
