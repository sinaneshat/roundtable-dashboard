/**
 * OpenAPI Application Factory
 *
 * Provides factory functions for creating OpenAPI-compliant Hono applications
 * with consistent validation, error handling, and type safety.
 *
 * Features:
 * - Automatic validation error formatting (422 responses)
 * - Type-safe request/response validation
 * - OpenAPI documentation generation
 * - RPC type inference for frontend clients
 *
 * Pattern:
 * All API routes MUST use createOpenApiApp() for proper type safety and
 * automatic RPC client type inference.
 */

import { OpenAPIHono } from '@hono/zod-openapi';

import type { ApiEnv } from '@/api/types';

import { customValidationHook } from './validation';

/**
 * Create an OpenAPI-compliant Hono application with validation
 *
 * This factory creates a properly configured OpenAPIHono instance with:
 * - Custom validation hook for consistent error formatting
 * - Type-safe request/response handling
 * - Automatic OpenAPI schema generation
 * - RPC type inference support
 *
 * Usage:
 * ```typescript
 * const app = createOpenApiApp();
 *
 * app.openapi(myRoute, myHandler);
 * ```
 *
 * @returns Configured OpenAPIHono instance with ApiEnv context
 */
export function createOpenApiApp() {
  return new OpenAPIHono<ApiEnv>({
    defaultHook: customValidationHook,
  });
}
