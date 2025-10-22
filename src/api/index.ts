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

import { createOpenApiApp } from './core/app';
import { attachSession, csrfProtection, protectMutations, requireSession } from './middleware';
import { errorLoggerMiddleware, honoLoggerMiddleware } from './middleware/hono-logger';
import { ensureOpenRouterInitialized } from './middleware/openrouter';
import { ensureRAGInitialized } from './middleware/rag';
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
// Auth routes
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
// Chat routes
import {
  addParticipantHandler,
  analyzeBackgroundHandler,
  analyzeRoundHandler,
  createCustomRoleHandler,
  createThreadHandler,
  deleteCustomRoleHandler,
  deleteParticipantHandler,
  deleteThreadHandler,
  getCustomRoleHandler,
  getPublicThreadHandler,
  getThreadAnalysesHandler,
  getThreadBySlugHandler,
  getThreadChangelogHandler,
  getThreadFeedbackHandler,
  getThreadHandler,
  getThreadMessagesHandler,
  listCustomRolesHandler,
  listThreadsHandler,
  setRoundFeedbackHandler,
  streamChatHandler,
  updateCustomRoleHandler,
  updateParticipantHandler,
  updateThreadHandler,
} from './routes/chat/handler';
import {
  addParticipantRoute,
  analyzeRoundRoute,
  createCustomRoleRoute,
  createThreadRoute,
  deleteCustomRoleRoute,
  deleteParticipantRoute,
  deleteThreadRoute,
  getCustomRoleRoute,
  getPublicThreadRoute,
  getThreadAnalysesRoute,
  getThreadBySlugRoute,
  getThreadChangelogRoute,
  getThreadFeedbackRoute,
  getThreadMessagesRoute,
  getThreadRoute,
  listCustomRolesRoute,
  listThreadsRoute,
  setRoundFeedbackRoute,
  streamChatRoute,
  updateCustomRoleRoute,
  updateParticipantRoute,
  updateThreadRoute,
} from './routes/chat/route';
// MCP (Model Context Protocol) routes
import {
  addParticipantToolHandler,
  createThreadToolHandler,
  getThreadToolHandler,
  listModelsToolHandler,
  listResourcesHandler,
  listToolsHandler,
  sendMessageToolHandler,
} from './routes/mcp/handler';
import {
  addParticipantToolRoute,
  createThreadToolRoute,
  getThreadToolRoute,
  listModelsToolRoute,
  listResourcesRoute,
  listToolsRoute,
  sendMessageToolRoute,
} from './routes/mcp/route';
// Models routes (dynamic OpenRouter models)
import { listModelsHandler } from './routes/models/handler';
import { listModelsRoute } from './routes/models/route';
// ============================================================================
// Route and Handler Imports (organized to match registration order below)
// ============================================================================
// System/health routes
import {
  clearCacheHandler,
  detailedHealthHandler,
  healthHandler,
} from './routes/system/handler';
import {
  clearCacheRoute,
  detailedHealthRoute,
  healthRoute,
} from './routes/system/route';
// Usage tracking routes
import {
  checkCustomRoleQuotaHandler,
  checkMessageQuotaHandler,
  checkThreadQuotaHandler,
  getUserUsageStatsHandler,
} from './routes/usage/handler';
import {
  checkCustomRoleQuotaRoute,
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
  // Skip timeout for streaming endpoints (chat streaming and moderator analysis)
  // AI SDK v5 PATTERN: Reasoning models (DeepSeek-R1, Claude 4, etc.) need 10+ minutes
  // Reference: https://sdk.vercel.ai/docs/providers/community-providers/claude-code#extended-thinking
  if (c.req.path.includes('/stream') || c.req.path.includes('/analyze') || c.req.path.includes('/chat')) {
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
  // Must skip for /chat (AI streaming), /stream, and /analyze (moderator streaming)
  if (c.req.path.includes('/stream') || c.req.path.includes('/chat') || c.req.path.includes('/analyze')) {
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

// OpenRouter initialization for MCP routes (uses models and chat functionality)
app.use('/mcp/*', ensureOpenRouterInitialized);

// RAG initialization for all chat routes
app.use('/chat/*', ensureRAGInitialized);

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

// POST /chat - stream AI response (AI SDK v5 pattern - requires auth + CSRF)
// This is the OFFICIAL AI SDK endpoint for streaming chat responses
app.use('/chat', csrfProtection, requireSession);

// /chat/threads/:id - mixed access pattern
// GET: public access for public threads (handler checks ownership/public status)
// PATCH/DELETE: protected mutations (requires auth + CSRF)
app.use('/chat/threads/:id', protectMutations);

// GET /chat/threads/slug/:slug - get thread by slug (requires auth)
app.use('/chat/threads/slug/:slug', requireSession);

// GET /chat/threads/:id/messages - get messages (requires auth)
app.use('/chat/threads/:id/messages', requireSession);

// Participant management routes (protected)
app.use('/chat/threads/:id/participants', csrfProtection, requireSession);
app.use('/chat/participants/:id', csrfProtection, requireSession);

// Custom role routes (protected)
app.use('/chat/custom-roles', csrfProtection, requireSession);
app.use('/chat/custom-roles/:id', csrfProtection, requireSession);

// Moderator analysis routes (protected)
app.use('/chat/threads/:threadId/rounds/:roundNumber/analyze', csrfProtection, requireSession);
app.use('/chat/threads/:id/analyses', requireSession); // GET analyses for thread

// Register all routes directly on the app
const appRoutes = app
  // ============================================================================
  // System Routes - Health monitoring and diagnostics
  // ============================================================================
  .openapi(healthRoute, healthHandler) // Basic health check for monitoring
  .openapi(detailedHealthRoute, detailedHealthHandler) // Detailed health check with environment and dependencies
  .openapi(clearCacheRoute, clearCacheHandler) // Clear all backend caches

  // ============================================================================
  // Auth Routes - User authentication and session management (protected)
  // ============================================================================
  .openapi(secureMeRoute, secureMeHandler) // Get current authenticated user

  // ============================================================================
  // API Keys Routes - API key management and authentication (protected)
  // ============================================================================
  .openapi(listApiKeysRoute, listApiKeysHandler) // List user API keys (without key values)
  .openapi(getApiKeyRoute, getApiKeyHandler) // Get API key details (without key value)
  .openapi(createApiKeyRoute, createApiKeyHandler) // Create new API key (returns key value once)
  .openapi(updateApiKeyRoute, updateApiKeyHandler) // Update API key settings
  .openapi(deleteApiKeyRoute, deleteApiKeyHandler) // Delete API key

  // ============================================================================
  // Billing Routes - Stripe billing, subscriptions, and payments
  // ============================================================================
  // Products (public)
  .openapi(listProductsRoute, listProductsHandler) // List all active products with pricing
  .openapi(getProductRoute, getProductHandler) // Get specific product with all pricing plans
  // Checkout (protected)
  .openapi(createCheckoutSessionRoute, createCheckoutSessionHandler) // Create Stripe checkout session
  // Customer Portal (protected)
  .openapi(createCustomerPortalSessionRoute, createCustomerPortalSessionHandler) // Create customer portal session
  // Sync (protected)
  .openapi(syncAfterCheckoutRoute, syncAfterCheckoutHandler) // Sync Stripe data after checkout
  // Subscriptions (protected)
  .openapi(listSubscriptionsRoute, listSubscriptionsHandler) // List user subscriptions
  .openapi(getSubscriptionRoute, getSubscriptionHandler) // Get subscription details
  // Subscription Management (protected)
  .openapi(switchSubscriptionRoute, switchSubscriptionHandler) // Switch subscription plan
  .openapi(cancelSubscriptionRoute, cancelSubscriptionHandler) // Cancel subscription
  // Webhooks (public with signature verification)
  .openapi(handleWebhookRoute, handleWebhookHandler) // Handle Stripe webhook events

  // ============================================================================
  // Chat Routes - Multi-model AI conversations (ChatGPT pattern)
  // ============================================================================
  // Thread Management
  .openapi(listThreadsRoute, listThreadsHandler) // List threads with cursor pagination
  .openapi(createThreadRoute, createThreadHandler) // Create thread with mode and configuration
  .openapi(getThreadRoute, getThreadHandler) // Get thread details with participants
  .openapi(getThreadBySlugRoute, getThreadBySlugHandler) // Get thread by slug (authenticated)
  .openapi(updateThreadRoute, updateThreadHandler) // Update thread (title, mode, status, metadata)
  .openapi(deleteThreadRoute, deleteThreadHandler) // Delete thread (soft delete)
  .openapi(getPublicThreadRoute, getPublicThreadHandler) // Get public thread by slug (no auth)
  // Message Management
  .openapi(getThreadMessagesRoute, getThreadMessagesHandler) // Get thread messages
  .openapi(getThreadChangelogRoute, getThreadChangelogHandler) // Get configuration changelog
  .openapi(streamChatRoute, streamChatHandler) // Stream AI responses via SSE
  // Participant Management (protected)
  .openapi(addParticipantRoute, addParticipantHandler) // Add AI model participant to thread
  .openapi(updateParticipantRoute, updateParticipantHandler) // Update participant role/priority/settings
  .openapi(deleteParticipantRoute, deleteParticipantHandler) // Remove participant from thread
  // Custom Role System (protected)
  .openapi(listCustomRolesRoute, listCustomRolesHandler) // List user custom role templates
  .openapi(createCustomRoleRoute, createCustomRoleHandler) // Create custom role template
  .openapi(getCustomRoleRoute, getCustomRoleHandler) // Get custom role details
  .openapi(updateCustomRoleRoute, updateCustomRoleHandler) // Update custom role template
  .openapi(deleteCustomRoleRoute, deleteCustomRoleHandler) // Delete custom role template
  // Moderator Analysis (protected, backend-triggered only)
  .openapi(getThreadAnalysesRoute, getThreadAnalysesHandler) // Get persisted moderator analyses (read-only)
  .openapi(analyzeRoundRoute, analyzeRoundHandler) // Stream moderator analysis for a round
  // Round Feedback (protected)
  .openapi(setRoundFeedbackRoute, setRoundFeedbackHandler) // Set/update round feedback (like/dislike)
  .openapi(getThreadFeedbackRoute, getThreadFeedbackHandler) // Get all round feedback for a thread

  // ============================================================================
  // Usage Routes - Usage tracking and quota management (protected)
  // ============================================================================
  .openapi(getUserUsageStatsRoute, getUserUsageStatsHandler) // Get user usage statistics
  .openapi(checkThreadQuotaRoute, checkThreadQuotaHandler) // Check thread creation quota
  .openapi(checkMessageQuotaRoute, checkMessageQuotaHandler) // Check message sending quota
  .openapi(checkCustomRoleQuotaRoute, checkCustomRoleQuotaHandler) // Check custom role creation quota

  // ============================================================================
  // Models Routes - Simplified OpenRouter models endpoint (public)
  // ============================================================================
  .openapi(listModelsRoute, listModelsHandler) // List all available OpenRouter models

  // ============================================================================
  // MCP Routes - Model Context Protocol server implementation (API key auth)
  // ============================================================================
  // MCP Discovery
  .openapi(listToolsRoute, listToolsHandler) // List available MCP tools
  .openapi(listResourcesRoute, listResourcesHandler) // List accessible MCP resources
  // MCP Tool Execution
  .openapi(createThreadToolRoute, createThreadToolHandler) // Tool: Create chat thread
  .openapi(sendMessageToolRoute, sendMessageToolHandler) // Tool: Send message to thread
  .openapi(getThreadToolRoute, getThreadToolHandler) // Tool: Get thread details
  .openapi(listModelsToolRoute, listModelsToolHandler) // Tool: List models
  .openapi(addParticipantToolRoute, addParticipantToolHandler) // Tool: Add participant to thread
;

// ============================================================================
// Step 5: Export AppType for RPC client type inference (CRITICAL!)
// This MUST be done immediately after defining routes, as per the docs
// This enables full type safety for RPC clients
// ============================================================================

export type AppType = typeof appRoutes;

// ============================================================================
// Step 5.5: Internal Background Processing Endpoints (NOT in OpenAPI)
// ============================================================================

// ✅ INTERNAL ONLY: Background analysis processing endpoint
// NOT exposed in OpenAPI documentation
// Called via WORKER_SELF_REFERENCE service binding
appRoutes.post('/chat/analyze-background', analyzeBackgroundHandler);

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
    { name: 'chat', description: 'Multi-model AI chat threads and messages' },
    { name: 'usage', description: 'Usage tracking and quota management' },
    { name: 'models', description: 'Dynamic OpenRouter AI models discovery and management' },
    { name: 'mcp', description: 'Model Context Protocol server implementation' },
    { name: 'tools', description: 'MCP tool execution endpoints' },
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
