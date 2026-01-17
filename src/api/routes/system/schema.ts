import { z } from '@hono/zod-openapi';

import { HealthCheckDetailTypeSchema, HealthStatusSchema } from '@/api/core/enums';
import { CoreSchemas, createApiResponseSchema } from '@/api/core/schemas';
import type { ApiEnv } from '@/api/types';

// ============================================================================
// INTERNAL HANDLER SCHEMAS - Single Source of Truth
// ============================================================================

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
  details: z.object({
    detailType: HealthCheckDetailTypeSchema,
    missingVars: z.array(z.string()).openapi({
      description: 'List of missing environment variables',
      example: ['VAR_1', 'VAR_2'],
    }),
  }).optional().openapi({
    description: 'Typed health check details for environment validation',
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

// ============================================================================
// BENCHMARK SCHEMAS
// ============================================================================

const BenchmarkTimingsSchema = z.object({
  min: z.number().openapi({ example: 5.2, description: 'Minimum execution time in ms' }),
  max: z.number().openapi({ example: 45.8, description: 'Maximum execution time in ms' }),
  avg: z.number().openapi({ example: 15.3, description: 'Average execution time in ms' }),
  p95: z.number().openapi({ example: 38.2, description: '95th percentile execution time in ms' }),
  total: z.number().openapi({ example: 76.5, description: 'Total execution time in ms' }),
}).openapi('BenchmarkTimings');

const BenchmarkResultSchema = z.object({
  name: z.string().openapi({ example: 'getUserCreditBalance', description: 'Benchmark name' }),
  iterations: z.number().int().openapi({ example: 5, description: 'Number of iterations run' }),
  timings: BenchmarkTimingsSchema,
  runs: z.array(z.number()).openapi({
    example: [5.2, 12.1, 15.3, 18.9, 25.0],
    description: 'Individual run times in ms',
  }),
}).openapi('BenchmarkResult');

const BenchmarkPayloadSchema = z.object({
  startedAt: CoreSchemas.timestamp().openapi({ description: 'Benchmark start time' }),
  completedAt: CoreSchemas.timestamp().openapi({ description: 'Benchmark end time' }),
  totalDuration: z.number().openapi({ example: 1250.5, description: 'Total benchmark duration in ms' }),
  results: z.array(BenchmarkResultSchema).openapi({ description: 'Individual benchmark results' }),
}).openapi('BenchmarkPayload');

export const BenchmarkResponseSchema = createApiResponseSchema(BenchmarkPayloadSchema).openapi('BenchmarkResponse');

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
export type BenchmarkTimings = z.infer<typeof BenchmarkTimingsSchema>;
export type BenchmarkResult = z.infer<typeof BenchmarkResultSchema>;
export type BenchmarkPayload = z.infer<typeof BenchmarkPayloadSchema>;
export type BenchmarkResponse = z.infer<typeof BenchmarkResponseSchema>;
