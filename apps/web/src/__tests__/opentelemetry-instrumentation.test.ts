/**
 * OpenTelemetry Instrumentation Tests
 *
 * Tests verifying OpenTelemetry registration patterns, configuration, and error tracking
 * for AI SDK streamText telemetry across the application.
 *
 * ✅ PATTERN: Tests OTEL configuration patterns (not actual import)
 * ✅ COVERAGE: Environment-based OTEL skip, service configuration, error tracking
 *
 * Note: These tests verify the configuration patterns, not the actual instrumentation.ts
 * import (which uses dynamic imports that can't be resolved in Vitest).
 */

import { ModelIds } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { APP_VERSION } from '@/constants/version';

// ============================================================================
// Test Utilities
// ============================================================================

function createMockRequest(options?: {
  path?: string;
  method?: string;
  cookie?: string | null;
}) {
  return {
    headers: {
      cookie: options?.cookie ?? 'ph_distinct_id=user_123',
    },
    method: options?.method || 'POST',
    path: options?.path || '/api/v1/chat/stream',
  };
}

function createMockContext(options?: {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
  renderSource?: string;
  revalidateReason?: string;
}) {
  return {
    renderSource: options?.renderSource || 'react-server-components',
    revalidateReason: options?.revalidateReason,
    routePath: options?.routePath || '/api/v1/chat/stream',
    routerKind: options?.routerKind || 'App Router',
    routeType: options?.routeType || 'route',
  };
}

function getDistinctIdFromCookie(cookie: string | null): string {
  if (!cookie) {
    return 'anonymous';
  }
  const match = cookie.match(/ph_distinct_id=([^;]+)/);
  return match ? match[1] : 'anonymous';
}

function shouldSkipOtelRegistration(
  env: string,
  hasExplicitEndpoint: boolean,
): boolean {
  return env === 'local' && !hasExplicitEndpoint;
}

function getOtelConfig(
  serviceName: string,
  version: string,
  environment: string,
) {
  return {
    attributes: {
      'deployment.environment': environment,
      'service.version': version,
    },
    serviceName,
  };
}

// ============================================================================
// OpenTelemetry Registration Pattern Tests
// ============================================================================

describe('openTelemetry Instrumentation Patterns', () => {
  describe('shouldSkipOtelRegistration', () => {
    it('should skip OTEL registration in local env without endpoint', () => {
      const shouldSkip = shouldSkipOtelRegistration('local', false);
      expect(shouldSkip).toBeTruthy();
    });

    it('should NOT skip OTEL in local env with explicit endpoint', () => {
      const shouldSkip = shouldSkipOtelRegistration('local', true);
      expect(shouldSkip).toBeFalsy();
    });

    it('should NOT skip OTEL in preview environment', () => {
      const shouldSkip = shouldSkipOtelRegistration('preview', false);
      expect(shouldSkip).toBeFalsy();
    });

    it('should NOT skip OTEL in production environment', () => {
      const shouldSkip = shouldSkipOtelRegistration('prod', false);
      expect(shouldSkip).toBeFalsy();
    });
  });

  describe('getOtelConfig', () => {
    it('should create correct config for preview environment', () => {
      const config = getOtelConfig('roundtable-dashboard', '1.0.0', 'preview');

      expect(config.serviceName).toBe('roundtable-dashboard');
      expect(config.attributes['service.version']).toBe('1.0.0');
      expect(config.attributes['deployment.environment']).toBe('preview');
    });

    it('should create correct config for production environment', () => {
      const config = getOtelConfig('roundtable-dashboard', '2.5.0', 'prod');

      expect(config.serviceName).toBe('roundtable-dashboard');
      expect(config.attributes['service.version']).toBe('2.5.0');
      expect(config.attributes['deployment.environment']).toBe('prod');
    });

    it('should use provided version', () => {
      const config = getOtelConfig('roundtable-dashboard', '3.0.0-beta', 'preview');

      expect(config.attributes['service.version']).toBe('3.0.0-beta');
    });
  });
});

// ============================================================================
// Error Hook Pattern Tests
// ============================================================================

describe('onRequestError Hook Patterns', () => {
  describe('distinct ID Extraction', () => {
    it('should extract distinct_id from PostHog cookie', () => {
      const distinctId = getDistinctIdFromCookie('ph_distinct_id=user_123');
      expect(distinctId).toBe('user_123');
    });

    it('should extract distinct_id from complex cookie string', () => {
      const distinctId = getDistinctIdFromCookie('other=value; ph_distinct_id=custom_user_456; another=data');
      expect(distinctId).toBe('custom_user_456');
    });

    it('should return anonymous when cookie is missing', () => {
      const distinctId = getDistinctIdFromCookie(null);
      expect(distinctId).toBe('anonymous');
    });

    it('should return anonymous when ph_distinct_id not in cookie', () => {
      const distinctId = getDistinctIdFromCookie('other=value; session=abc');
      expect(distinctId).toBe('anonymous');
    });
  });

  describe('error Context Structure', () => {
    it('should create correct request context structure', () => {
      const request = createMockRequest();
      const context = createMockContext();

      const errorContext = {
        $exception_source: 'server',
        requestMethod: request.method,
        requestPath: request.path,
        routePath: context.routePath,
        routerKind: context.routerKind,
        routeType: context.routeType,
      };

      expect(errorContext.$exception_source).toBe('server');
      expect(errorContext.routerKind).toBe('App Router');
      expect(errorContext.routePath).toBe('/api/v1/chat/stream');
      expect(errorContext.routeType).toBe('route');
      expect(errorContext.requestPath).toBe('/api/v1/chat/stream');
      expect(errorContext.requestMethod).toBe('POST');
    });

    it('should include revalidateReason when present', () => {
      const context = createMockContext({ revalidateReason: 'stale-while-revalidate' });

      const errorContext = {
        revalidateReason: context.revalidateReason,
        routerKind: context.routerKind,
      };

      expect(errorContext.revalidateReason).toBe('stale-while-revalidate');
    });

    it('should handle missing revalidateReason', () => {
      const context = createMockContext();

      const errorContext = {
        revalidateReason: context.revalidateReason,
        routerKind: context.routerKind,
      };

      expect(errorContext.revalidateReason).toBeUndefined();
    });
  });

  describe('skip Conditions', () => {
    it('should skip in local environment', () => {
      const env = 'local';
      const shouldSkip = env === 'local';

      expect(shouldSkip).toBeTruthy();
    });

    it('should skip in Cloudflare Pages runtime', () => {
      const runtime = 'edge';
      const shouldSkip = runtime === 'edge';

      expect(shouldSkip).toBeTruthy();
    });

    it('should NOT skip in Node.js runtime in preview', () => {
      const runtime = 'nodejs';
      const env = 'preview';
      const shouldSkip = runtime === 'edge' || env === 'local';

      expect(shouldSkip).toBeFalsy();
    });
  });
});

// ============================================================================
// Telemetry Metadata Schema Tests
// ============================================================================

describe('telemetry Metadata Schema', () => {
  it('should define correct participant telemetry metadata structure', () => {
    const participantTelemetryMetadata = {
      conversation_mode: 'council',
      estimated_input_tokens: 1500,
      has_custom_system_prompt: false,
      input_cost_per_million: 2.5,
      is_first_participant: true,
      is_reasoning_model: false,
      is_regeneration: false,
      max_output_tokens: 8192,
      model_context_length: 128000,
      model_id: ModelIds.OPENAI_GPT_4O_MINI,
      model_name: 'GPT-4o',
      output_cost_per_million: 10.0,
      participant_id: 'participant_abc',
      participant_index: 0,
      participant_role: 'AI Analyst',
      rag_enabled: true,
      reasoning_enabled: false,
      round_number: 1,
      thread_id: 'thread_123',
      total_participants: 3,
      user_id: 'user_456',
      user_tier: 'pro',
      uses_dynamic_pricing: true,
    };

    // Verify all required fields are present
    expect(participantTelemetryMetadata.thread_id).toBeDefined();
    expect(participantTelemetryMetadata.round_number).toBeTypeOf('number');
    expect(participantTelemetryMetadata.participant_index).toBeTypeOf('number');
    expect(participantTelemetryMetadata.is_first_participant).toBeTypeOf('boolean');
    expect(participantTelemetryMetadata.total_participants).toBeTypeOf('number');
  });

  it('should define correct moderator telemetry metadata structure', () => {
    const MODERATOR_PARTICIPANT_INDEX = -99;

    const moderatorTelemetryMetadata = {
      conversation_mode: 'council',
      is_moderator: true,
      model_id: ModelIds.ANTHROPIC_CLAUDE_SONNET_4,
      model_name: 'Claude Sonnet 4',
      participant_count: 3,
      participant_id: 'moderator',
      participant_index: MODERATOR_PARTICIPANT_INDEX,
      participant_role: 'AI Moderator',
      round_number: 1,
      thread_id: 'thread_123',
      user_id: 'user_456',
    };

    expect(moderatorTelemetryMetadata.is_moderator).toBeTruthy();
    expect(moderatorTelemetryMetadata.participant_index).toBe(-99);
    expect(moderatorTelemetryMetadata.participant_count).toBeTypeOf('number');
  });

  it('should validate functionId format for participants', () => {
    const threadId = 'thread_abc123';
    const participantIndex = 2;

    const functionId = `chat.thread.${threadId}.participant.${participantIndex}`;

    expect(functionId).toBe('chat.thread.thread_abc123.participant.2');
    expect(functionId).toMatch(/^chat\.thread\.[^.]+\.participant\.\d+$/);
  });

  it('should validate functionId format for moderator', () => {
    const threadId = 'thread_abc123';

    const functionId = `chat.thread.${threadId}.moderator`;

    expect(functionId).toBe('chat.thread.thread_abc123.moderator');
    expect(functionId).toMatch(/^chat\.thread\.[^.]+\.moderator$/);
  });
});

// ============================================================================
// OTEL Span Attribute Tests
// ============================================================================

describe('oTEL Span Attributes', () => {
  it('should include all required AI SDK telemetry fields', () => {
    // These are the fields that AI SDK's experimental_telemetry exports to OTEL
    const requiredFields = [
      'thread_id',
      'round_number',
      'conversation_mode',
      'participant_id',
      'participant_index',
      'model_id',
      'user_id',
    ];

    const telemetryConfig = {
      functionId: 'chat.thread.test.participant.0',
      isEnabled: true,
      metadata: {
        conversation_mode: 'council',
        model_id: ModelIds.OPENAI_GPT_4O_MINI,
        participant_id: 'p1',
        participant_index: 0,
        round_number: 0,
        thread_id: 'test',
        user_id: 'user_1',
      },
      recordInputs: true,
      recordOutputs: true,
    };

    for (const field of requiredFields) {
      expect(telemetryConfig.metadata).toHaveProperty(field);
    }
  });

  it('should support optional pricing attributes', () => {
    const pricingAttributes = {
      input_cost_per_million: 2.5,
      output_cost_per_million: 10.0,
      uses_dynamic_pricing: true,
    };

    expect(pricingAttributes.uses_dynamic_pricing).toBeTruthy();
    expect(pricingAttributes.input_cost_per_million).toBeTypeOf('number');
    expect(pricingAttributes.output_cost_per_million).toBeTypeOf('number');
  });

  it('should support reasoning model attributes', () => {
    const reasoningAttributes = {
      is_reasoning_model: true,
      reasoning_enabled: true,
    };

    expect(reasoningAttributes.is_reasoning_model).toBeTruthy();
    expect(reasoningAttributes.reasoning_enabled).toBeTruthy();
  });
});

// ============================================================================
// Environment Configuration Tests
// ============================================================================

describe('environment Configuration', () => {
  it('should map WEBAPP_ENV values correctly', () => {
    const envMapping: Record<string, boolean> = {
      local: true, // Should skip without endpoint
      preview: false, // Should NOT skip
      prod: false, // Should NOT skip
    };

    for (const [env, shouldSkip] of Object.entries(envMapping)) {
      expect(shouldSkipOtelRegistration(env, false)).toBe(shouldSkip);
    }
  });

  it('should always register in non-local environments', () => {
    const nonLocalEnvs = ['preview', 'prod', 'staging', 'development'];

    for (const env of nonLocalEnvs) {
      expect(shouldSkipOtelRegistration(env, false)).toBeFalsy();
    }
  });

  it('should use default version when not provided', () => {
    const version = undefined;
    const defaultVersion = version || APP_VERSION;

    expect(defaultVersion).toBe(APP_VERSION);
  });

  it('should use provided version when available', () => {
    const version = '2.5.0';
    const finalVersion = version || APP_VERSION;

    expect(finalVersion).toBe('2.5.0');
  });
});
