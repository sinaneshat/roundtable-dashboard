import { z } from '@hono/zod-openapi';
import { HealthCheckDetailTypeSchema, HealthStatusSchema } from '@roundtable/shared/enums';

import { CoreSchemas, createApiResponseSchema } from '@/core/schemas';
import type { ApiEnv } from '@/types';

// ============================================================================
// INTERNAL HANDLER SCHEMAS - Single Source of Truth
// ============================================================================

const HealthPayloadSchema = z.object({
  ok: z.boolean().openapi({
    description: 'Health check status indicator',
    example: true,
  }),
  status: HealthStatusSchema.openapi({
    description: 'System health status',
    example: 'healthy',
  }),
  timestamp: CoreSchemas.timestamp().openapi({
    description: 'Health check execution timestamp',
    example: new Date().toISOString(),
  }),
}).openapi('HealthPayload');

export const HealthResponseSchema = createApiResponseSchema(HealthPayloadSchema).openapi('HealthResponse');

const HealthCheckResultSchema = z.object({
  details: z.object({
    detailType: HealthCheckDetailTypeSchema,
    missingVars: z.array(z.string()).openapi({
      description: 'List of missing environment variables',
      example: ['VAR_1', 'VAR_2'],
    }),
  }).optional().openapi({
    description: 'Typed health check details for environment validation',
  }),
  duration: z.number().optional().openapi({
    description: 'Health check execution time in milliseconds',
    example: 25,
  }),
  message: z.string().openapi({
    description: 'Human-readable health status message',
    example: 'Database is responsive',
  }),
  status: HealthStatusSchema.openapi({
    description: 'Health status of the checked component',
    example: 'healthy',
  }),
}).openapi('HealthCheckResult');

const DetailedHealthPayloadSchema = z.object({
  dependencies: z.record(z.string(), HealthCheckResultSchema).openapi({
    description: 'Individual component health check results',
    example: {
      database: { duration: 25, message: 'Database is responsive', status: 'healthy' },
      environment: { message: 'All required environment variables are present', status: 'healthy' },
    },
  }),
  duration: z.number().openapi({
    description: 'Total health check execution time in milliseconds',
    example: 150,
  }),
  env: z.object({
    nodeEnv: z.string().openapi({
      description: 'Node.js environment mode',
      example: 'production',
    }),
    runtime: z.string().openapi({
      description: 'Runtime environment identifier',
      example: 'cloudflare-workers',
    }),
    version: z.string().openapi({
      description: 'Runtime version information',
      example: 'Node.js/22',
    }),
  }).openapi({
    description: 'Runtime environment information',
  }),
  ok: z.boolean().openapi({
    description: 'Overall system health indicator',
    example: true,
  }),
  status: HealthStatusSchema.openapi({
    description: 'Overall system health status',
    example: 'healthy',
  }),
  summary: z.object({
    degraded: z.number().int().nonnegative().openapi({
      description: 'Number of degraded components',
      example: 1,
    }),
    healthy: z.number().int().nonnegative().openapi({
      description: 'Number of healthy components',
      example: 5,
    }),
    total: z.number().int().positive().openapi({
      description: 'Total number of health checks performed',
      example: 6,
    }),
    unhealthy: z.number().int().nonnegative().openapi({
      description: 'Number of unhealthy components',
      example: 0,
    }),
  }).openapi({
    description: 'Health check summary statistics',
  }),
  timestamp: CoreSchemas.timestamp().openapi({
    description: 'Health check execution timestamp',
    example: new Date().toISOString(),
  }),
}).openapi('DetailedHealthPayload');

export const DetailedHealthResponseSchema = createApiResponseSchema(DetailedHealthPayloadSchema).openapi('DetailedHealthResponse');

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
