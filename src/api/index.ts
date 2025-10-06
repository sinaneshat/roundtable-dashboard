/**
 * Roundtable API - Hono Zod OpenAPI Implementation
 *
 * This file follows the EXACT pattern from the official Hono Zod OpenAPI documentation.
 * It provides full type safety and automatic RPC client type inference.
 *
 * IMPORTANT: All routes MUST use createOpenApiApp() pattern for RPC type safety.
 * Never use createRoute directly in route handlers - always use OpenAPIHono apps.
 */

import { Scalar } from '@scalar/hono-api-reference';
import { createMarkdownFromOpenApi } from '@scalar/openapi-to-markdown';
import { bodyLimit } from 'hono/body-limit';
import { contextStorage } from 'hono/context-storage';
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { prettyJSON } from 'hono/pretty-json';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { timeout } from 'hono/timeout';
import { timing } from 'hono/timing';
import { trimTrailingSlash } from 'hono/trailing-slash';
import notFound from 'stoker/middlewares/not-found';
import onError from 'stoker/middlewares/on-error';

import { createOpenApiApp } from './factory';
import { attachSession, csrfProtection, protectMutations, requireSession } from './middleware';
import { errorLoggerMiddleware, honoLoggerMiddleware } from './middleware/hono-logger';
import { ensureOpenRouterInitialized } from './middleware/openrouter';
import { RateLimiterFactory } from './middleware/rate-limiter-factory';
import { ensureStripeInitialized } from './middleware/stripe';
// API Keys routes
import {
  createApiKeyHandler,
  deleteApiKeyHandler,
  getApiKeyHandler,
  listApiKeysHandler,
  updateApiKeyHandler,
} from './routes/api-keys/handler';
import {
  createApiKeyRoute,
  deleteApiKeyRoute,
  getApiKeyRoute,
  listApiKeysRoute,
  updateApiKeyRoute,
} from './routes/api-keys/route';
// Import routes and handlers directly for proper RPC type inference
import { secureMeHandler } from './routes/auth/handler';
import { secureMeRoute } from './routes/auth/route';
// Billing routes
import {
  cancelSubscriptionHandler,
  createCheckoutSessionHandler,
  createCustomerPortalSessionHandler,
  getProductHandler,
  getSubscriptionHandler,
  handleWebhookHandler,
  listProductsHandler,
  listSubscriptionsHandler,
  switchSubscriptionHandler,
  syncAfterCheckoutHandler,
} from './routes/billing/handler';
import {
  cancelSubscriptionRoute,
  createCheckoutSessionRoute,
  createCustomerPortalSessionRoute,
  getProductRoute,
  getSubscriptionRoute,
  handleWebhookRoute,
  listProductsRoute,
  listSubscriptionsRoute,
  switchSubscriptionRoute,
  syncAfterCheckoutRoute,
} from './routes/billing/route';
// Chat routes - Core endpoints only (ChatGPT pattern)
import {
  addParticipantHandler,
  createCustomRoleHandler,
  createMemoryHandler,
  createThreadHandler,
  deleteCustomRoleHandler,
  deleteMemoryHandler,
  deleteParticipantHandler,
  deleteThreadHandler,
  getCustomRoleHandler,
  getMemoryHandler,
  getPublicThreadHandler,
  getThreadBySlugHandler,
  getThreadHandler,
  listCustomRolesHandler,
  listMemoriesHandler,
  listThreadsHandler,
  streamChatHandler,
  updateCustomRoleHandler,
  updateMemoryHandler,
  updateParticipantHandler,
  updateThreadHandler,
} from './routes/chat/handler';
import {
  addParticipantRoute,
  createCustomRoleRoute,
  createMemoryRoute,
  createThreadRoute,
  deleteCustomRoleRoute,
  deleteMemoryRoute,
  deleteParticipantRoute,
  deleteThreadRoute,
  getCustomRoleRoute,
  getMemoryRoute,
  getPublicThreadRoute,
  getThreadBySlugRoute,
  getThreadRoute,
  listCustomRolesRoute,
  listMemoriesRoute,
  listThreadsRoute,
  streamChatRoute,
  updateCustomRoleRoute,
  updateMemoryRoute,
  updateParticipantRoute,
  updateThreadRoute,
} from './routes/chat/route';
// System/health routes
import {
  detailedHealthHandler,
  healthHandler,
} from './routes/system/handler';
import {
  detailedHealthRoute,
  healthRoute,
} from './routes/system/route';
// Usage tracking routes
import {
  checkCustomRoleQuotaHandler,
  checkMemoryQuotaHandler,
  checkMessageQuotaHandler,
  checkThreadQuotaHandler,
  getUserUsageStatsHandler,
} from './routes/usage/handler';
import {
  checkCustomRoleQuotaRoute,
  checkMemoryQuotaRoute,
  checkMessageQuotaRoute,
  checkThreadQuotaRoute,
  getUserUsageStatsRoute,
} from './routes/usage/route';

// ============================================================================
// Step 1: Create the main OpenAPIHono app with defaultHook (following docs)
// ============================================================================

const app = createOpenApiApp();

// ============================================================================
// Step 2: Apply global middleware (following Hono patterns)
// ============================================================================

// Logging and formatting
app.use('*', prettyJSON());
app.use('*', honoLoggerMiddleware);
app.use('*', errorLoggerMiddleware);
app.use('*', trimTrailingSlash());

// Core middleware
app.use('*', contextStorage());
app.use('*', secureHeaders()); // Use default secure headers - much simpler
app.use('*', requestId());
// IMPORTANT: Compression handled natively by Cloudflare Workers
// Using Hono's compress() middleware causes binary corruption in OpenNext.js
// Let Cloudflare handle gzip/brotli compression automatically
app.use('*', timing());
// Apply timeout to all routes except streaming endpoints
app.use('*', async (c, next) => {
  // Skip timeout for streaming endpoints
  if (c.req.path.includes('/stream')) {
    return next();
  }
  return timeout(15000)(c, next);
});

// Body limit
app.use('*', bodyLimit({
  maxSize: 5 * 1024 * 1024,
  onError: c => c.text('Payload Too Large', 413),
}));

// CORS configuration - Use environment variables for dynamic origin configuration
app.use('*', (c, next) => {
  // Get the current environment's allowed origin from NEXT_PUBLIC_APP_URL
  const appUrl = c.env.NEXT_PUBLIC_APP_URL;
  const webappEnv = c.env.NEXT_PUBLIC_WEBAPP_ENV || 'local';
  const isDevelopment = webappEnv === 'local' || c.env.NODE_ENV === 'development';

  // Build allowed origins dynamically based on environment
  const allowedOrigins: string[] = [];

  // Only allow localhost in development environment
  if (isDevelopment) {
    allowedOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000');
  }

  // Add current environment URL if available and not localhost
  if (appUrl && !appUrl.includes('localhost') && !appUrl.includes('127.0.0.1')) {
    allowedOrigins.push(appUrl);
  }

  const middleware = cors({
    origin: (origin) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin)
        return origin;

      // Check if origin is in allowed list
      return allowedOrigins.includes(origin) ? origin : null;
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  });
  return middleware(c, next);
});

// ETag support - Skip for streaming endpoints to avoid buffering
app.use('*', async (c, next) => {
  // Skip ETag for streaming endpoints as it buffers the entire response
  if (c.req.path.includes('/stream')) {
    return next();
  }
  return etag()(c, next);
});

// Session attachment
app.use('*', attachSession);

// Stripe initialization for all billing routes and webhooks
// Using wildcard pattern to apply middleware to all /billing/* routes
app.use('/billing/*', ensureStripeInitialized);
app.use('/webhooks/stripe', ensureStripeInitialized);

// OpenRouter initialization for all chat routes
// Using wildcard pattern to apply middleware to all /chat/* routes
app.use('/chat/*', ensureOpenRouterInitialized);

// Global rate limiting
app.use('*', RateLimiterFactory.create('api'));

// ============================================================================
// Step 3: Configure error and not-found handlers
// ============================================================================

app.onError(onError);
app.notFound(notFound);

// ============================================================================
// Step 4: Register all routes directly on main app for RPC type inference
// CRITICAL: Routes must be registered with .openapi() for RPC to work
// ============================================================================

// Apply CSRF protection and authentication to protected routes
// Following Hono best practices: apply CSRF only to authenticated routes
app.use('/auth/me', csrfProtection, requireSession);

// Protected API keys endpoints
app.use('/auth/api-keys', csrfProtection, requireSession);

// Protected billing endpoints (checkout, portal, sync, subscriptions)
app.use('/billing/checkout', csrfProtection, requireSession);
app.use('/billing/portal', csrfProtection, requireSession);
app.use('/billing/sync-after-checkout', csrfProtection, requireSession);
app.use('/billing/subscriptions', csrfProtection, requireSession);
app.use('/billing/subscriptions/:id', csrfProtection, requireSession);
app.use('/billing/subscriptions/:id/switch', csrfProtection, requireSession);
app.use('/billing/subscriptions/:id/cancel', csrfProtection, requireSession);

// Protected chat endpoints (ChatGPT pattern with smart access control)
// POST /chat/threads - create thread (requires auth + CSRF)
app.use('/chat/threads', csrfProtection, requireSession);

// /chat/threads/:id - mixed access pattern
// GET: public access for public threads (handler checks ownership/public status)
// PATCH/DELETE: protected mutations (requires auth + CSRF)
app.use('/chat/threads/:id', protectMutations);

// GET /chat/threads/slug/:slug - get thread by slug (requires auth)
app.use('/chat/threads/slug/:slug', requireSession);

// POST /chat/threads/:id/messages - send message (requires auth + CSRF)
app.use('/chat/threads/:id/messages', csrfProtection, requireSession);

// POST /chat/threads/:id/stream - stream AI response (requires auth + CSRF)
app.use('/chat/threads/:id/stream', csrfProtection, requireSession);

// Participant management routes (protected)
app.use('/chat/threads/:id/participants', csrfProtection, requireSession);
app.use('/chat/participants/:id', csrfProtection, requireSession);

// Memory system routes (protected)
app.use('/chat/memories', csrfProtection, requireSession);
app.use('/chat/memories/:id', csrfProtection, requireSession);

// Custom role routes (protected)
app.use('/chat/custom-roles', csrfProtection, requireSession);
app.use('/chat/custom-roles/:id', csrfProtection, requireSession);

// Register all routes directly on the app
const appRoutes = app
  // System/health routes
  .openapi(healthRoute, healthHandler)
  .openapi(detailedHealthRoute, detailedHealthHandler)
  // Auth routes
  .openapi(secureMeRoute, secureMeHandler)
  // API Keys routes (protected)
  .openapi(listApiKeysRoute, listApiKeysHandler)
  .openapi(getApiKeyRoute, getApiKeyHandler)
  .openapi(createApiKeyRoute, createApiKeyHandler)
  .openapi(updateApiKeyRoute, updateApiKeyHandler)
  .openapi(deleteApiKeyRoute, deleteApiKeyHandler)
  // Billing routes - Products (public)
  .openapi(listProductsRoute, listProductsHandler)
  .openapi(getProductRoute, getProductHandler)
  // Billing routes - Checkout (protected)
  .openapi(createCheckoutSessionRoute, createCheckoutSessionHandler)
  // Billing routes - Customer Portal (protected)
  .openapi(createCustomerPortalSessionRoute, createCustomerPortalSessionHandler)
  // Billing routes - Sync (protected)
  .openapi(syncAfterCheckoutRoute, syncAfterCheckoutHandler)
  // Billing routes - Subscriptions (protected)
  .openapi(listSubscriptionsRoute, listSubscriptionsHandler)
  .openapi(getSubscriptionRoute, getSubscriptionHandler)
  // Billing routes - Subscription Management (protected)
  .openapi(switchSubscriptionRoute, switchSubscriptionHandler)
  .openapi(cancelSubscriptionRoute, cancelSubscriptionHandler)
  // Billing routes - Webhooks (public with signature verification)
  .openapi(handleWebhookRoute, handleWebhookHandler)
  // Chat routes - Core endpoints only (ChatGPT pattern)
  .openapi(listThreadsRoute, listThreadsHandler) // List threads with pagination
  .openapi(createThreadRoute, createThreadHandler) // Create thread with participants + first message
  .openapi(getThreadRoute, getThreadHandler) // Get thread with participants + messages
  .openapi(getThreadBySlugRoute, getThreadBySlugHandler) // Get thread by slug (authenticated)
  .openapi(updateThreadRoute, updateThreadHandler) // Update thread (title, favorite, public, etc.)
  .openapi(deleteThreadRoute, deleteThreadHandler) // Delete thread
  .openapi(streamChatRoute, streamChatHandler) // Stream AI response via SSE (replaces sendMessage)
  .openapi(getPublicThreadRoute, getPublicThreadHandler) // Get public thread by slug (no auth)
  // Chat routes - Participant management
  .openapi(addParticipantRoute, addParticipantHandler) // Add model to thread
  .openapi(updateParticipantRoute, updateParticipantHandler) // Update participant role/priority/settings
  .openapi(deleteParticipantRoute, deleteParticipantHandler) // Remove participant from thread
  // Chat routes - Memory system
  .openapi(listMemoriesRoute, listMemoriesHandler) // List user memories
  .openapi(createMemoryRoute, createMemoryHandler) // Create memory/preset
  .openapi(getMemoryRoute, getMemoryHandler) // Get memory details
  .openapi(updateMemoryRoute, updateMemoryHandler) // Update memory
  .openapi(deleteMemoryRoute, deleteMemoryHandler) // Delete memory
  // Chat routes - Custom Role system
  .openapi(listCustomRolesRoute, listCustomRolesHandler) // List user custom roles
  .openapi(createCustomRoleRoute, createCustomRoleHandler) // Create custom role template
  .openapi(getCustomRoleRoute, getCustomRoleHandler) // Get custom role details
  .openapi(updateCustomRoleRoute, updateCustomRoleHandler) // Update custom role
  .openapi(deleteCustomRoleRoute, deleteCustomRoleHandler) // Delete custom role
  // Usage tracking routes (protected)
  .openapi(getUserUsageStatsRoute, getUserUsageStatsHandler)
  .openapi(checkThreadQuotaRoute, checkThreadQuotaHandler)
  .openapi(checkMessageQuotaRoute, checkMessageQuotaHandler)
  .openapi(checkMemoryQuotaRoute, checkMemoryQuotaHandler)
  .openapi(checkCustomRoleQuotaRoute, checkCustomRoleQuotaHandler)
;

// ============================================================================
// Step 5: Export AppType for RPC client type inference (CRITICAL!)
// This MUST be done immediately after defining routes, as per the docs
// This enables full type safety for RPC clients
// ============================================================================

export type AppType = typeof appRoutes;

// ============================================================================
// Step 6: OpenAPI documentation endpoints
// ============================================================================

// OpenAPI specification document endpoint
appRoutes.doc('/doc', c => ({
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Roundtable API',
    description: 'roundtable.now API - Collaborative AI brainstorming platform. Built with Hono, Zod, and OpenAPI.',
    contact: { name: 'Roundtable', url: 'https://roundtable.now' },
    license: { name: 'Proprietary' },
  },
  tags: [
    { name: 'system', description: 'System health and diagnostics' },
    { name: 'auth', description: 'Authentication and authorization' },
    { name: 'api-keys', description: 'API key management and authentication' },
    { name: 'billing', description: 'Stripe billing, subscriptions, and payments' },
    { name: 'chat', description: 'Multi-model AI chat threads, messages, and memories' },
    { name: 'usage', description: 'Usage tracking and quota management' },
  ],
  servers: [
    {
      url: `${new URL(c.req.url).origin}/api/v1`,
      description: 'Current environment',
    },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
}));

// OpenAPI JSON endpoint (redirect to the doc endpoint)
appRoutes.get('/openapi.json', async (c) => {
  // Redirect to the existing doc endpoint which contains the full OpenAPI spec
  return c.redirect('/api/v1/doc');
});

// ============================================================================
// Step 7: Additional endpoints (Scalar UI, LLMs, etc.)
// ============================================================================

// Scalar API documentation UI
appRoutes.get('/scalar', Scalar({
  url: '/api/v1/doc',
}));

// Health endpoints are now properly registered as OpenAPI routes above

// LLM-friendly documentation
appRoutes.get('/llms.txt', async (c) => {
  try {
    const document = appRoutes.getOpenAPI31Document({
      openapi: '3.1.0',
      info: {
        title: 'Application API',
        version: '1.0.0',
      },
    });
    const markdown = await createMarkdownFromOpenApi(JSON.stringify(document));
    return c.text(markdown);
  } catch {
    return c.text('LLMs document unavailable');
  }
});

// ============================================================================
// Step 8: Export the app (default export for Cloudflare Workers/Bun)
// ============================================================================

export default {
  fetch: appRoutes.fetch,
};
