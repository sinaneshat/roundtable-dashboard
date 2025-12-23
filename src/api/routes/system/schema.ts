import { z } from '@hono/zod-openapi';

import { HealthStatusSchema } from '@/api/core/enums';
// ✅ IMPORT FIX: Import directly from source files instead of barrel
import { CoreSchemas, createApiResponseSchema } from '@/api/core/schemas';
// ============================================================================
// INTERNAL HANDLER SCHEMAS - Single Source of Truth
// ============================================================================
import type { ApiEnv } from '@/api/types';

const HealthPayloadSchema = z.object({
  ok: z.boolean().openapi({
    example: true,
    description: 'Health check status indicator',
  }),
  status: HealthStatusSchema.openapi({
    example: 'healthy',
    description: 'System health status',
  }),
  timestamp: CoreSchemas.timestamp().openapi({
    example: new Date().toISOString(),
    description: 'Health check execution timestamp',
  }),
}).openapi('HealthPayload');

export const HealthResponseSchema = createApiResponseSchema(HealthPayloadSchema).openapi('HealthResponse');

const HealthCheckResultSchema = z.object({
  status: HealthStatusSchema.openapi({
    example: 'healthy',
    description: 'Health status of the checked component',
  }),
  message: z.string().openapi({
    example: 'Database is responsive',
    description: 'Human-readable health status message',
  }),
  duration: z.number().optional().openapi({
    example: 25,
    description: 'Health check execution time in milliseconds',
  }),
  details: z.record(z.string(), z.unknown()).optional().openapi({
    example: { missingVars: ['VAR_1', 'VAR_2'] },
    description: 'Additional health check details',
  }),
}).openapi('HealthCheckResult');

const DetailedHealthPayloadSchema = z.object({
  ok: z.boolean().openapi({
    example: true,
    description: 'Overall system health indicator',
  }),
  status: HealthStatusSchema.openapi({
    example: 'healthy',
    description: 'Overall system health status',
  }),
  timestamp: CoreSchemas.timestamp().openapi({
    example: new Date().toISOString(),
    description: 'Health check execution timestamp',
  }),
  duration: z.number().openapi({
    example: 150,
    description: 'Total health check execution time in milliseconds',
  }),
  env: z.object({
    runtime: z.string().openapi({
      example: 'cloudflare-workers',
      description: 'Runtime environment identifier',
    }),
    version: z.string().openapi({
      example: 'Node.js/22',
      description: 'Runtime version information',
    }),
    nodeEnv: z.string().openapi({
      example: 'production',
      description: 'Node.js environment mode',
    }),
  }).openapi({
    description: 'Runtime environment information',
  }),
  dependencies: z.record(z.string(), HealthCheckResultSchema).openapi({
    example: {
      database: { status: 'healthy', message: 'Database is responsive', duration: 25 },
      environment: { status: 'healthy', message: 'All required environment variables are present' },
    },
    description: 'Individual component health check results',
  }),
  summary: z.object({
    total: z.number().int().positive().openapi({
      example: 6,
      description: 'Total number of health checks performed',
    }),
    healthy: z.number().int().nonnegative().openapi({
      example: 5,
      description: 'Number of healthy components',
    }),
    degraded: z.number().int().nonnegative().openapi({
      example: 1,
      description: 'Number of degraded components',
    }),
    unhealthy: z.number().int().nonnegative().openapi({
      example: 0,
      description: 'Number of unhealthy components',
    }),
  }).openapi({
    description: 'Health check summary statistics',
  }),
}).openapi('DetailedHealthPayload');

export const DetailedHealthResponseSchema = createApiResponseSchema(DetailedHealthPayloadSchema).openapi('DetailedHealthResponse');

// ============================================================================
// CACHE CLEAR SCHEMAS
// ============================================================================

const ClearCachePayloadSchema = z.object({
  ok: z.boolean().openapi({
    example: true,
    description: 'Cache clear operation success indicator',
  }),
  message: z.string().openapi({
    example: 'All backend caches cleared successfully',
    description: 'Human-readable cache clear status message',
  }),
  timestamp: CoreSchemas.timestamp().openapi({
    example: new Date().toISOString(),
    description: 'Cache clear execution timestamp',
  }),
  clearedTags: z.array(z.string()).openapi({
    example: ['user-tier-*', 'user-usage-*', 'active-products'],
    description: 'List of cache tags that were cleared',
  }),
}).openapi('ClearCachePayload');

export const ClearCacheResponseSchema = createApiResponseSchema(ClearCachePayloadSchema).openapi('ClearCacheResponse');

/**
 * Health check context type
 *
 * SINGLE SOURCE OF TRUTH for health check handler context
 * Used internally by health check helper functions
 */
export type HealthCheckContext = {
  env: ApiEnv['Bindings'];
};

// ============================================================================
// TYPE EXPORTS FOR FRONTEND
// ============================================================================

export type HealthPayload = z.infer<typeof HealthPayloadSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type HealthCheckResult = z.infer<typeof HealthCheckResultSchema>;
export type DetailedHealthPayload = z.infer<typeof DetailedHealthPayloadSchema>;
export type DetailedHealthResponse = z.infer<typeof DetailedHealthResponseSchema>;
export type ClearCachePayload = z.infer<typeof ClearCachePayloadSchema>;
export type ClearCacheResponse = z.infer<typeof ClearCacheResponseSchema>;
