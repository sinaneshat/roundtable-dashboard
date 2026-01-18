/**
 * Roundtable API - Hono Zod OpenAPI Implementation
 *
 * This file follows the EXACT pattern from the official Hono Zod OpenAPI documentation.
 * It provides full type safety and automatic RPC client type inference.
 *
 * IMPORTANT: All routes MUST use createOpenApiApp() pattern for RPC type safety.
 * Never use createRoute directly in route handlers - always use OpenAPIHono apps.
 */

import { Hono } from 'hono';
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

import { APP_VERSION } from '@/constants/version';
import { getAllowedOriginsFromContext } from '@/lib/config/base-urls';
import type { ApiEnv } from '@/types';

import { createOpenApiApp } from './core/app';
import { attachSession, csrfProtection, ensureOpenRouterInitialized, ensureStripeInitialized, errorLogger, performanceTracking, RateLimiterFactory } from './middleware';
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
  syncCreditsAfterCheckoutHandler,
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
  syncCreditsAfterCheckoutRoute,
} from './routes/billing/route';
// Chat routes
import {
  addParticipantHandler,
  analyzePromptHandler,
  councilModeratorRoundHandler,
  createCustomRoleHandler,
  createThreadHandler,
  createUserPresetHandler,
  deleteCustomRoleHandler,
  deleteParticipantHandler,
  deleteThreadHandler,
  deleteUserPresetHandler,
  executePreSearchHandler,
  getCustomRoleHandler,
  getPublicThreadHandler,
  getRoundStatusHandler,
  getThreadBySlugHandler,
  getThreadChangelogHandler,
  getThreadFeedbackHandler,
  getThreadHandler,
  getThreadMessagesHandler,
  getThreadPreSearchesHandler,
  getThreadRoundChangelogHandler,
  getThreadSlugStatusHandler,
  getThreadStreamResumptionStateHandler,
  getUserPresetHandler,
  listCustomRolesHandler,
  listPublicThreadSlugsHandler,
  listSidebarThreadsHandler,
  listThreadsHandler,
  listUserPresetsHandler,
  resumeThreadStreamHandler,
  setRoundFeedbackHandler,
  streamChatHandler,
  updateCustomRoleHandler,
  updateParticipantHandler,
  updateThreadHandler,
  updateUserPresetHandler,
} from './routes/chat';
import {
  addParticipantRoute,
  analyzePromptRoute,
  councilModeratorRoundRoute,
  createCustomRoleRoute,
  createThreadRoute,
  createUserPresetRoute,
  deleteCustomRoleRoute,
  deleteParticipantRoute,
  deleteThreadRoute,
  deleteUserPresetRoute,
  executePreSearchRoute,
  getCustomRoleRoute,
  getPublicThreadRoute,
  getRoundStatusRoute,
  getThreadBySlugRoute,
  getThreadChangelogRoute,
  getThreadFeedbackRoute,
  getThreadMessagesRoute,
  getThreadPreSearchesRoute,
  getThreadRoundChangelogRoute,
  getThreadRoute,
  getThreadSlugStatusRoute,
  getThreadStreamResumptionStateRoute,
  getUserPresetRoute,
  listCustomRolesRoute,
  listPublicThreadSlugsRoute,
  listSidebarThreadsRoute,
  listThreadsRoute,
  listUserPresetsRoute,
  resumeThreadStreamRoute,
  setRoundFeedbackRoute,
  streamChatRoute,
  updateCustomRoleRoute,
  updateParticipantRoute,
  updateThreadRoute,
  updateUserPresetRoute,
} from './routes/chat/route';
// Credits routes
import {
  estimateCreditCostHandler,
  getCreditBalanceHandler,
  getCreditTransactionsHandler,
} from './routes/credits/handler';
import {
  estimateCreditCostRoute,
  getCreditBalanceRoute,
  getCreditTransactionsRoute,
} from './routes/credits/route';
// MCP (Model Context Protocol) routes - Consolidated JSON-RPC + REST endpoints
import {
  callToolHandler,
  listResourcesHandler,
  listToolsHandler,
  mcpJsonRpcHandler,
  openAIFunctionsHandler,
} from './routes/mcp/handler';
import {
  callToolRoute,
  listResourcesRoute,
  listToolsRoute,
  mcpJsonRpcRoute,
  openAIFunctionsRoute,
} from './routes/mcp/route';
// Models routes (dynamic OpenRouter models)
import { listModelsHandler } from './routes/models/handler';
import { listModelsRoute } from './routes/models/route';
// ============================================================================
// Route and Handler Imports (organized to match registration order below)
// ============================================================================
// OG Image routes
import { ogImageHandler } from './routes/og/handler';
import { ogImageRoute } from './routes/og/route';
// Project routes
import {
  addAttachmentToProjectHandler,
  createProjectHandler,
  createProjectMemoryHandler,
  deleteProjectHandler,
  deleteProjectMemoryHandler,
  getProjectAttachmentHandler,
  getProjectContextHandler,
  getProjectHandler,
  getProjectMemoryHandler,
  listProjectAttachmentsHandler,
  listProjectMemoriesHandler,
  listProjectsHandler,
  removeAttachmentFromProjectHandler,
  updateProjectAttachmentHandler,
  updateProjectHandler,
  updateProjectMemoryHandler,
} from './routes/project/handler';
import {
  addAttachmentToProjectRoute,
  createProjectMemoryRoute,
  createProjectRoute,
  deleteProjectMemoryRoute,
  deleteProjectRoute,
  getProjectAttachmentRoute,
  getProjectContextRoute,
  getProjectMemoryRoute,
  getProjectRoute,
  listProjectAttachmentsRoute,
  listProjectMemoriesRoute,
  listProjectsRoute,
  removeAttachmentFromProjectRoute,
  updateProjectAttachmentRoute,
  updateProjectMemoryRoute,
  updateProjectRoute,
} from './routes/project/route';
// System/health routes
import {
  benchmarkHandler,
  clearCacheHandler,
  detailedHealthHandler,
  healthHandler,
} from './routes/system/handler';
import {
  benchmarkRoute,
  clearCacheRoute,
  detailedHealthRoute,
  healthRoute,
} from './routes/system/route';
// Test routes (development/test only)
import {
  setUserCreditsHandler,
} from './routes/test/handler';
import {
  setUserCreditsRoute,
} from './routes/test/route';
// Upload routes (R2 file uploads - secure ticket-based pattern)
import {
  abortMultipartUploadHandler,
  completeMultipartUploadHandler,
  createMultipartUploadHandler,
  deleteUploadHandler,
  downloadUploadHandler,
  getDownloadUrlHandler,
  getUploadHandler,
  listUploadsHandler,
  requestUploadTicketHandler,
  updateUploadHandler,
  uploadPartHandler,
  uploadWithTicketHandler,
} from './routes/uploads/handler';
import {
  abortMultipartUploadRoute,
  completeMultipartUploadRoute,
  createMultipartUploadRoute,
  deleteUploadRoute,
  downloadUploadRoute,
  getDownloadUrlRoute,
  getUploadRoute,
  listUploadsRoute,
  requestUploadTicketRoute,
  updateUploadRoute,
  uploadPartRoute,
  uploadWithTicketRoute,
} from './routes/uploads/route';
// Usage tracking routes
import {
  getUserUsageStatsHandler,
} from './routes/usage/handler';
import {
  getUserUsageStatsRoute,
} from './routes/usage/route';

// ============================================================================
// Environment Detection (sync, build-time check)
// ============================================================================
// WEBAPP_ENV is inlined at build time - safe for sync access
const WEBAPP_ENV = process.env.WEBAPP_ENV || 'development';
const IS_DEV_ENVIRONMENT = WEBAPP_ENV === 'local' || WEBAPP_ENV === 'development' || WEBAPP_ENV === 'preview';

// ============================================================================
// Step 1: Create the main OpenAPIHono app with defaultHook (following docs)
// ============================================================================

const app = createOpenApiApp();

// ============================================================================
// Step 2: Apply global middleware (following Hono patterns)
// ============================================================================

// 🔍 DEBUG: Log ALL requests (especially POST) to diagnose 400 errors
// Enable with DEBUG_REQUESTS=true to avoid MaxListenersExceeded warnings
// from parallel console.error() calls during high-concurrency development
if (process.env.DEBUG_REQUESTS === 'true') {
  app.use('*', async (c, next) => {
    const startTime = Date.now();
    const method = c.req.method;
    const path = c.req.path;

    // Log ALL POST requests to catch the 400 source
    if (method === 'POST') {
      try {
        const clonedRequest = c.req.raw.clone();
        const bodyText = await clonedRequest.text();
        const contentLength = c.req.header('content-length');
        const contentType = c.req.header('content-type');

        console.error(`[REQUEST-DEBUG] ${method} ${path}:`, {
          contentLength,
          contentType,
          bodyLength: bodyText.length,
          bodyPreview: bodyText.slice(0, 300),
          isValidJson: (() => {
            try {
              JSON.parse(bodyText);
              return true;
            } catch (e) {
              return `Invalid: ${e instanceof Error ? e.message : String(e)}`;
            }
          })(),
        });
      } catch (err) {
        console.error(`[REQUEST-DEBUG] Error reading ${method} ${path} body:`, err);
      }
    }

    await next();

    // Log response status for all 4xx/5xx errors
    const status = c.res.status;
    if (status >= 400) {
      const duration = Date.now() - startTime;
      console.error(`[RESPONSE-DEBUG] ${method} ${path} -> ${status} in ${duration}ms`);
    }
  });
}

// Formatting
app.use('*', prettyJSON());
app.use('*', trimTrailingSlash());

// Performance tracking (preview/local only) - must be early to capture full request timing
app.use('*', performanceTracking);

// Core middleware
app.use('*', contextStorage());

// Security headers configuration
// ============================================================================
// ⚠️ IMPORTANT: Content-Security-Policy (CSP) Architecture
//
// CSP is DISABLED for API routes because they return JSON, not HTML.
// Only the /scalar route has CSP because it returns an HTML page.
//
// 📍 API Routes (/api/*): No CSP needed (JSON responses)
// 📍 Scalar Route (/api/v1/scalar): Permissive CSP for docs UI (see below)
// 📍 Web App (TanStack Start): Handles its own CSP
//
// ✅ What Hono's secureHeaders() provides (with CSP disabled):
//   - X-Content-Type-Options: nosniff
//   - X-Frame-Options: DENY
//   - X-XSS-Protection: 1; mode=block
//   - Referrer-Policy: no-referrer
//   - Strict-Transport-Security (when HTTPS)
//
// 🔧 To modify Scalar CSP: Edit the /scalar middleware below
// ============================================================================
app.use('*', secureHeaders({
  contentSecurityPolicy: {}, // Empty object disables CSP - not needed for JSON APIs
}));

app.use('*', requestId());
// IMPORTANT: Compression handled natively by Cloudflare Workers
// Let Cloudflare handle gzip/brotli compression automatically
app.use('*', timing());
// Apply timeout to all routes except streaming endpoints
// ⚠️ PERFORMANCE: Increased to 30s to account for D1 cold starts and cross-region latency
// Cloudflare Workers Standard allows up to 30s CPU time (configured in wrangler.jsonc limits.cpu_ms)
app.use('*', async (c, next) => {
  // Skip timeout for streaming endpoints (chat streaming and round summary)
  // AI SDK v6 PATTERN: Reasoning models (Claude 4, o1, o3, etc.) need 10+ minutes
  // Reference: https://sdk.vercel.ai/docs/providers/community-providers/claude-code#extended-thinking
  if (c.req.path.includes('/stream') || c.req.path.includes('/moderator') || c.req.path.includes('/chat')) {
    return next();
  }
  return timeout(30000)(c, next);
});

// Body limit - default 5MB for most routes
// Upload routes get their own higher limit below
app.use('*', async (c, next) => {
  // Skip body limit for upload routes - they have their own higher limits
  if (c.req.path.startsWith('/uploads')) {
    return next();
  }
  return bodyLimit({
    maxSize: 5 * 1024 * 1024,
    onError: c => c.text('Payload Too Large', 413),
  })(c, next);
});

// Higher body limit for file upload routes (100MB for single uploads)
app.use('/uploads', bodyLimit({
  maxSize: 100 * 1024 * 1024,
  onError: c => c.text('Payload Too Large - max 100MB for uploads', 413),
}));

// CORS configuration - Uses centralized URL config from base-urls.ts
app.use('*', async (c, next) => {
  const allowedOrigins = getAllowedOriginsFromContext(c);

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
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cache-Control', 'Pragma'],
  });
  return middleware(c, next);
});

// ETag support - Skip for streaming endpoints to avoid buffering
app.use('*', async (c, next) => {
  // Skip ETag for streaming endpoints as it buffers the entire response
  // Must skip for /chat (AI streaming), /stream, and /moderator (round summary streaming)
  if (c.req.path.includes('/stream') || c.req.path.includes('/chat') || c.req.path.includes('/moderator')) {
    return next();
  }
  return etag()(c, next);
});

// Session attachment - skip for public endpoints that don't need auth
// ⚠️ PERFORMANCE: Session lookup is expensive (DB query) - skip for truly public routes
// This avoids expensive database queries on every public request
app.use('*', async (c, next) => {
  const path = c.req.path;
  const method = c.req.method;

  // Skip session for routes where:
  // 1. Truly public endpoints (never need auth)
  // 2. Routes with handlers that do their own auth (avoid double session lookup)
  //
  // ⚠️ PERF: createHandler with auth:'session' already calls getSession()
  // Running attachSession middleware first would cause DOUBLE DB lookup
  if (
    // Public endpoints - never need auth
    path.startsWith('/chat/public/')
    || path.startsWith('/system/')
    || path === '/health'
    || path === '/api/v1/health'
    || path === '/doc'
    || path === '/openapi.json'
    || path === '/scalar'
    || path === '/llms.txt'
    || path.startsWith('/webhooks/')
    || (path.startsWith('/billing/products') && method === 'GET')
    || (path === '/models' && method === 'GET')
    || path.startsWith('/_next/')
    || path.startsWith('/static/')
    || path.endsWith('.ico')
    || path.endsWith('.png')
    || path.endsWith('.jpg')
    || path.endsWith('.svg')
    // Routes with createHandler auth - handlers do their own session lookup
    // These routes all use createHandler with auth:'session' which does its own getSession()
    || path === '/chat'
    || path.startsWith('/chat/threads/')
    || path.startsWith('/chat/roles/')
    || path.startsWith('/chat/presets/')
    || path.startsWith('/usage/')
    || path.startsWith('/uploads/')
    || path.startsWith('/api-keys/')
    || path.startsWith('/projects/')
    || path.startsWith('/mcp/')
    || path.startsWith('/billing/')
  ) {
    c.set('session', null);
    c.set('user', null);
    return next();
  }
  return attachSession(c, next);
});

// Stripe initialization for all billing routes and webhooks
// Using wildcard pattern to apply middleware to all /billing/* routes
app.use('/billing/*', ensureStripeInitialized);
app.use('/webhooks/stripe', ensureStripeInitialized);

// OpenRouter initialization for all chat routes
// Using wildcard pattern to apply middleware to all /chat/* routes
app.use('/chat/*', ensureOpenRouterInitialized);

// OpenRouter initialization for MCP routes (uses models and chat functionality)
app.use('/mcp/*', ensureOpenRouterInitialized);

// Global rate limiting
app.use('*', RateLimiterFactory.create('api'));

// ============================================================================
// Step 3: Configure error and not-found handlers
// ============================================================================

// ✅ GLOBAL ERROR LOGGING: Catches ALL errors across ALL endpoints
// errorLogger wraps Stoker's onError with comprehensive error logging
// All errors are automatically logged - no need for try/catch in handlers
app.onError(errorLogger);
app.notFound(notFound);

// ============================================================================
// Step 4: Register all routes directly on main app for RPC type inference
// CRITICAL: Routes must be registered with .openapi() for RPC to work
// ============================================================================

// ============================================================================
// CSRF Protection for Mutation Routes
// ============================================================================
// ⚠️ PERF: Handlers use createHandler with auth:'session' which calls getSession()
// DO NOT add requireSession middleware here - it causes DOUBLE session lookup
// Only apply CSRF protection for POST/PATCH/PUT/DELETE routes

// Auth endpoints - CSRF only (handlers do their own auth)
app.use('/auth/me', csrfProtection);
app.use('/auth/api-keys', csrfProtection);

// Billing endpoints - CSRF only (handlers do their own auth)
app.use('/billing/checkout', csrfProtection);
app.use('/billing/portal', csrfProtection);
app.use('/billing/sync-after-checkout', csrfProtection);
app.use('/billing/sync-credits-after-checkout', csrfProtection);
app.use('/billing/subscriptions', csrfProtection);
app.use('/billing/subscriptions/:id', csrfProtection);
app.use('/billing/subscriptions/:id/switch', csrfProtection);
app.use('/billing/subscriptions/:id/cancel', csrfProtection);

// Test endpoints (development/test only)
if (process.env.NODE_ENV !== 'production') {
  app.use('/test/*', csrfProtection);
}

// Chat endpoints - CSRF only for mutations (handlers do their own auth)
app.on('POST', '/chat/threads', csrfProtection);
app.on('POST', '/chat', csrfProtection);
app.on(['PATCH', 'DELETE'], '/chat/threads/:id', csrfProtection);

// Participant management - CSRF only
app.use('/chat/threads/:id/participants', csrfProtection);
app.use('/chat/participants/:id', csrfProtection);

// Custom role routes - CSRF only
app.use('/chat/custom-roles', csrfProtection);
app.use('/chat/custom-roles/:id', csrfProtection);

// Pre-search routes - CSRF only for POST
app.on('POST', '/chat/threads/:threadId/rounds/:roundNumber/pre-search', csrfProtection);

// Moderator routes - CSRF only for POST
app.on('POST', '/chat/threads/:threadId/rounds/:roundNumber/moderator', csrfProtection);

// Feedback routes - CSRF only for POST
app.on('POST', '/chat/threads/:threadId/rounds/:roundNumber/feedback', csrfProtection);

// Project routes - CSRF only
app.use('/projects', csrfProtection);
app.on(['PATCH', 'DELETE'], '/projects/:id', csrfProtection);
app.use('/projects/:id/knowledge', csrfProtection);
app.use('/projects/:id/knowledge/:fileId', csrfProtection);

// Upload routes - CSRF + rate limiting only (handlers do their own auth)
// NOTE: Download routes have separate rate limiting
app.use('/uploads', async (c, next) => {
  // Skip rate limiting for download routes - they have their own rate limiter
  if (c.req.path.includes('/download')) {
    return next();
  }
  return RateLimiterFactory.create('upload')(c, next);
}, csrfProtection);
app.use('/uploads/ticket', RateLimiterFactory.create('upload'), csrfProtection);
app.use('/uploads/ticket/upload', RateLimiterFactory.create('upload'), csrfProtection);
app.on(['PATCH', 'DELETE'], '/uploads/:id', csrfProtection);
app.use('/uploads/:id/download', RateLimiterFactory.create('download'));
app.use('/uploads/:id/download-url', RateLimiterFactory.create('download'));
app.use('/uploads/multipart', RateLimiterFactory.create('upload'), csrfProtection);
app.on(['PATCH', 'DELETE'], '/uploads/multipart/:id', csrfProtection);
app.use('/uploads/multipart/:id/parts', RateLimiterFactory.create('upload'), csrfProtection);
app.use('/uploads/multipart/:id/complete', RateLimiterFactory.create('upload'), csrfProtection);

// Register all routes directly on the app
// Build route chain with conditional dev-only routes
let routeChain = app
  // ============================================================================
  // OG Image Routes - Dynamic image generation for social sharing
  // ============================================================================
  .openapi(ogImageRoute, ogImageHandler) // Generate OG images for chat threads
  // ============================================================================
  // System Routes - Health monitoring and diagnostics
  // ============================================================================
  .openapi(healthRoute, healthHandler) // Basic health check for monitoring
  .openapi(detailedHealthRoute, detailedHealthHandler); // Detailed health check with environment and dependencies

// Dev-only routes - only registered in local/preview/development environments
if (IS_DEV_ENVIRONMENT) {
  routeChain = routeChain
    .openapi(clearCacheRoute, clearCacheHandler) // Clear all backend caches (dev only)
    .openapi(benchmarkRoute, benchmarkHandler); // Database query benchmark (dev only)
}

const appRoutes = routeChain
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
  .openapi(syncAfterCheckoutRoute, syncAfterCheckoutHandler) // Sync Stripe subscription data after checkout
  .openapi(syncCreditsAfterCheckoutRoute, syncCreditsAfterCheckoutHandler) // Sync credit purchase after checkout (Theo's pattern: separate from subscriptions)
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
  .openapi(listSidebarThreadsRoute, listSidebarThreadsHandler) // List sidebar threads (lightweight)
  .openapi(createThreadRoute, createThreadHandler) // Create thread with mode and configuration
  .openapi(getThreadRoute, getThreadHandler) // Get thread details with participants
  .openapi(getThreadBySlugRoute, getThreadBySlugHandler) // Get thread by slug (authenticated)
  .openapi(getThreadSlugStatusRoute, getThreadSlugStatusHandler) // Poll for AI-generated slug updates
  .openapi(updateThreadRoute, updateThreadHandler) // Update thread (title, mode, status, metadata)
  .openapi(deleteThreadRoute, deleteThreadHandler) // Delete thread (soft delete)
  .openapi(getPublicThreadRoute, getPublicThreadHandler) // Get public thread by slug (no auth)
  .openapi(listPublicThreadSlugsRoute, listPublicThreadSlugsHandler) // List public thread slugs for SSG (no auth)
  // Message Management
  .openapi(getThreadMessagesRoute, getThreadMessagesHandler) // Get thread messages
  .openapi(getThreadChangelogRoute, getThreadChangelogHandler) // Get configuration changelog
  .openapi(getThreadRoundChangelogRoute, getThreadRoundChangelogHandler) // Get changelog for specific round (efficient)
  .openapi(streamChatRoute, streamChatHandler) // Stream AI responses via SSE
  .openapi(resumeThreadStreamRoute, resumeThreadStreamHandler) // Resume active thread stream (AI SDK pattern)
  .openapi(getThreadStreamResumptionStateRoute, getThreadStreamResumptionStateHandler) // Get stream resumption state for server-side prefetching
  // Participant Management (protected)
  .openapi(addParticipantRoute, addParticipantHandler) // Add AI model participant to thread
  .openapi(updateParticipantRoute, updateParticipantHandler) // Update participant role/priority/settings
  .openapi(deleteParticipantRoute, deleteParticipantHandler) // Remove participant from thread
  // Auto Mode (protected)
  .openapi(analyzePromptRoute, analyzePromptHandler) // Analyze prompt for auto mode configuration
  // Custom Role System (protected)
  .openapi(listCustomRolesRoute, listCustomRolesHandler) // List user custom role templates
  .openapi(createCustomRoleRoute, createCustomRoleHandler) // Create custom role template
  .openapi(getCustomRoleRoute, getCustomRoleHandler) // Get custom role details
  .openapi(updateCustomRoleRoute, updateCustomRoleHandler) // Update custom role template
  .openapi(deleteCustomRoleRoute, deleteCustomRoleHandler) // Delete custom role template
  // User Presets (protected, localStorage-based)
  .openapi(listUserPresetsRoute, listUserPresetsHandler) // List user presets
  .openapi(createUserPresetRoute, createUserPresetHandler) // Create user preset
  .openapi(getUserPresetRoute, getUserPresetHandler) // Get user preset details
  .openapi(updateUserPresetRoute, updateUserPresetHandler) // Update user preset
  .openapi(deleteUserPresetRoute, deleteUserPresetHandler) // Delete user preset
  // Pre-search (protected, web search results) - execute auto-creates DB record
  .openapi(getThreadPreSearchesRoute, getThreadPreSearchesHandler) // Get all pre-search results for thread
  .openapi(executePreSearchRoute, executePreSearchHandler) // Stream pre-search execution (auto-creates)
  // Council Moderator (protected, backend-triggered only)
  .openapi(councilModeratorRoundRoute, councilModeratorRoundHandler) // Stream council moderator generation (text streaming like participants)
  // Round Orchestration (protected, queue worker internal API)
  .openapi(getRoundStatusRoute, getRoundStatusHandler) // Get round status for queue worker orchestration
  // Round Feedback (protected)
  .openapi(setRoundFeedbackRoute, setRoundFeedbackHandler) // Set/update round feedback (like/dislike)
  .openapi(getThreadFeedbackRoute, getThreadFeedbackHandler) // Get all round feedback for a thread

  // ============================================================================
  // Project Routes - Project-based knowledge base management (protected)
  // ============================================================================
  // Project CRUD
  .openapi(listProjectsRoute, listProjectsHandler) // List user projects with search
  .openapi(createProjectRoute, createProjectHandler) // Create new project
  .openapi(getProjectRoute, getProjectHandler) // Get project details
  .openapi(updateProjectRoute, updateProjectHandler) // Update project name/description/settings
  .openapi(deleteProjectRoute, deleteProjectHandler) // Delete project (CASCADE)
  // Project Attachments (reference-based, S3/R2 best practice)
  .openapi(listProjectAttachmentsRoute, listProjectAttachmentsHandler) // List project attachments
  .openapi(addAttachmentToProjectRoute, addAttachmentToProjectHandler) // Add existing attachment to project
  .openapi(getProjectAttachmentRoute, getProjectAttachmentHandler) // Get single attachment
  .openapi(updateProjectAttachmentRoute, updateProjectAttachmentHandler) // Update attachment metadata
  .openapi(removeAttachmentFromProjectRoute, removeAttachmentFromProjectHandler) // Remove attachment reference
  // Project Memories
  .openapi(listProjectMemoriesRoute, listProjectMemoriesHandler) // List project memories
  .openapi(createProjectMemoryRoute, createProjectMemoryHandler) // Create memory
  .openapi(getProjectMemoryRoute, getProjectMemoryHandler) // Get single memory
  .openapi(updateProjectMemoryRoute, updateProjectMemoryHandler) // Update memory
  .openapi(deleteProjectMemoryRoute, deleteProjectMemoryHandler) // Delete memory
  // Project Context (RAG aggregation)
  .openapi(getProjectContextRoute, getProjectContextHandler) // Get aggregated project context

  // ============================================================================
  // Usage Routes - Single source of truth for usage and quota (protected)
  // ============================================================================
  .openapi(getUserUsageStatsRoute, getUserUsageStatsHandler) // Get all usage statistics and quota info

  // ============================================================================
  // Credits Routes - Credit balance and transaction management (protected)
  // ============================================================================
  .openapi(getCreditBalanceRoute, getCreditBalanceHandler) // Get credit balance and plan info
  .openapi(getCreditTransactionsRoute, getCreditTransactionsHandler) // Get credit transaction history
  .openapi(estimateCreditCostRoute, estimateCreditCostHandler); // Estimate credit cost for action

// Test Routes - Development/test only utilities (protected)
// Only registered in local/preview/development environments
let creditsChain = appRoutes;
if (IS_DEV_ENVIRONMENT) {
  creditsChain = creditsChain.openapi(setUserCreditsRoute, setUserCreditsHandler); // Set user credits (dev only)
}

const finalRoutes = creditsChain
  // ============================================================================
  // Models Routes - Simplified OpenRouter models endpoint (public)
  // ============================================================================
  .openapi(listModelsRoute, listModelsHandler) // List all available OpenRouter models

  // ============================================================================
  // MCP Routes - Model Context Protocol server (JSON-RPC 2.0 + REST convenience)
  // Following official MCP spec: https://modelcontextprotocol.io/specification
  // ============================================================================
  // JSON-RPC endpoint - Main MCP protocol transport
  .openapi(mcpJsonRpcRoute, mcpJsonRpcHandler) // POST /mcp - JSON-RPC 2.0 (tools/list, tools/call, etc.)
  // REST convenience endpoints - For HTTP integrations like n8n
  .openapi(listToolsRoute, listToolsHandler) // GET /mcp/tools - List tools (REST)
  .openapi(listResourcesRoute, listResourcesHandler) // GET /mcp/resources - List resources (REST)
  .openapi(callToolRoute, callToolHandler) // POST /mcp/tools/call - Execute tool (REST)
  .openapi(openAIFunctionsRoute, openAIFunctionsHandler) // GET /mcp/openai/functions - OpenAI format

  // ============================================================================
  // Upload Routes - R2 file uploads (secure ticket-based pattern)
  // ============================================================================
  // Upload management endpoints
  .openapi(listUploadsRoute, listUploadsHandler) // GET /uploads - List uploads
  .openapi(getUploadRoute, getUploadHandler) // GET /uploads/:id - Get upload
  .openapi(getDownloadUrlRoute, getDownloadUrlHandler) // GET /uploads/:id/download-url - Get signed URL
  .openapi(downloadUploadRoute, downloadUploadHandler) // GET /uploads/:id/download - Download
  .openapi(updateUploadRoute, updateUploadHandler) // PATCH /uploads/:id - Update metadata
  .openapi(deleteUploadRoute, deleteUploadHandler) // DELETE /uploads/:id - Delete upload
  // Secure ticket-based uploads (S3 presigned URL pattern)
  .openapi(requestUploadTicketRoute, requestUploadTicketHandler) // POST /uploads/ticket - Request upload ticket
  .openapi(uploadWithTicketRoute, uploadWithTicketHandler) // POST /uploads/ticket/upload - Upload with ticket
  // Multipart uploads (for large files > 100MB) - secure, requires auth
  .openapi(createMultipartUploadRoute, createMultipartUploadHandler) // POST /uploads/multipart - Initiate
  .openapi(uploadPartRoute, uploadPartHandler) // PUT /uploads/multipart/:id/parts - Upload part
  .openapi(completeMultipartUploadRoute, completeMultipartUploadHandler) // POST /uploads/multipart/:id/complete
  .openapi(abortMultipartUploadRoute, abortMultipartUploadHandler) // DELETE /uploads/multipart/:id - Abort
;

// ============================================================================
// Step 5: Export AppType for RPC client type inference (CRITICAL!)
// This MUST be done immediately after defining routes, as per the docs
// This enables full type safety for RPC clients
// ============================================================================

export type AppType = typeof finalRoutes;

// ============================================================================
// Step 6: OpenAPI documentation endpoints
// ============================================================================

// OpenAPI specification document endpoint
finalRoutes.doc('/doc', c => ({
  openapi: '3.0.0',
  info: {
    version: APP_VERSION,
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
    { name: 'Uploads', description: 'File uploads for chat attachments (R2 storage)' },
    { name: 'Multipart', description: 'Multipart uploads for large files' },
    { name: 'projects', description: 'Project-based knowledge base management with AutoRAG' },
    { name: 'knowledge-base', description: 'Knowledge file upload and management' },
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
finalRoutes.get('/openapi.json', async (c) => {
  // Redirect to the existing doc endpoint which contains the full OpenAPI spec
  return c.redirect('/api/v1/doc');
});

// ============================================================================
// Step 7: Additional endpoints (Scalar UI, LLMs, etc.)
// ============================================================================

// Scalar API documentation UI
// CSP headers set directly in Hono for this HTML endpoint
// Middleware to set permissive CSP for Scalar before the response is generated
finalRoutes.use('/scalar', async (c, next) => {
  await next();

  // Get the response that was set
  const response = c.res;

  // Permissive CSP for Scalar API documentation
  const csp = [
    'default-src \'self\' \'unsafe-inline\' \'unsafe-eval\' data: blob:',
    'script-src \'self\' \'unsafe-inline\' \'unsafe-eval\' https://cdn.jsdelivr.net https://unpkg.com https://cdnjs.cloudflare.com',
    'style-src \'self\' \'unsafe-inline\' https://fonts.googleapis.com https://cdn.jsdelivr.net https://unpkg.com',
    'font-src \'self\' https://fonts.gstatic.com https://cdn.jsdelivr.net',
    'img-src \'self\' data: blob: https:',
    'connect-src \'self\' https: wss: ws:',
    'worker-src \'self\' blob:',
    'child-src \'self\' blob:',
    'frame-ancestors \'none\'',
    'base-uri \'self\'',
    'form-action \'self\'',
  ].join('; ');

  // Clone response with new CSP header
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Content-Security-Policy', csp);

  c.res = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
});

finalRoutes.get('/scalar', async (c) => {
  // Lazy load Scalar to reduce worker startup CPU time
  const { Scalar } = await import('@scalar/hono-api-reference');
  return Scalar({ url: '/api/v1/doc' })(c);
});

// Health endpoints are now properly registered as OpenAPI routes above

// LLM-friendly documentation
finalRoutes.get('/llms.txt', async (c) => {
  try {
    // Lazy load markdown generator to reduce worker startup CPU time
    const { createMarkdownFromOpenApi } = await import('@scalar/openapi-to-markdown');
    const document = finalRoutes.getOpenAPI31Document({
      openapi: '3.1.0',
      info: {
        title: 'Application API',
        version: APP_VERSION,
      },
    });
    const markdown = await createMarkdownFromOpenApi(JSON.stringify(document));
    return c.text(markdown);
  } catch {
    return c.text('LLMs document unavailable');
  }
});

// ============================================================================
// Step 8: Create root app with /api/v1 basePath
// ============================================================================

// Root app that mounts all API routes under /api/v1
// This matches the expected URL structure: http://localhost:8787/api/v1/*
const rootApp = new Hono<ApiEnv>();

// ============================================================================
// Better Auth Handler - Mount at /api/auth/*
// ============================================================================
// CORS for Better Auth routes (social login, callbacks)
rootApp.use('/api/auth/*', async (c, next) => {
  const allowedOrigins = getAllowedOriginsFromContext(c);

  const middleware = cors({
    origin: (origin) => {
      if (!origin)
        return origin;
      return allowedOrigins.includes(origin) ? origin : null;
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cache-Control', 'Pragma'],
  });
  return middleware(c, next);
});

// Mount Better Auth handler for ALL paths under /api/auth
// Using .all() to catch all HTTP methods and path patterns
rootApp.all('/api/auth/*', async (c) => {
  const { auth } = await import('@/lib/auth/server');
  return auth.handler(c.req.raw);
});

// Mount the API routes under /api/v1
rootApp.route('/api/v1', finalRoutes);

// ============================================================================
// Step 9: Export the app (default export for Cloudflare Workers/Bun)
// ============================================================================

export default rootApp;
