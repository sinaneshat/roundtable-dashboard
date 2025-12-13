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

import { createOpenApiApp } from './core/app';
import { attachSession, csrfProtection, errorLogger, protectMutations, requireSession } from './middleware';
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
  analyzeRoundHandler,
  createCustomRoleHandler,
  createPreSearchHandler,
  createThreadHandler,
  deleteCustomRoleHandler,
  deleteParticipantHandler,
  deleteThreadHandler,
  executePreSearchHandler,
  getCustomRoleHandler,
  getPublicThreadHandler,
  getStreamStatusHandler,
  getThreadAnalysesHandler,
  getThreadBySlugHandler,
  getThreadChangelogHandler,
  getThreadFeedbackHandler,
  getThreadHandler,
  getThreadMessagesHandler,
  getThreadPreSearchesHandler,
  getThreadSlugStatusHandler,
  getThreadStreamResumptionStateHandler,
  listCustomRolesHandler,
  listThreadsHandler,
  resumeAnalysisStreamHandler,
  resumeStreamHandler,
  resumeThreadStreamHandler,
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
  createPreSearchRoute,
  createThreadRoute,
  deleteCustomRoleRoute,
  deleteParticipantRoute,
  deleteThreadRoute,
  executePreSearchRoute,
  getCustomRoleRoute,
  getPublicThreadRoute,
  getStreamStatusRoute,
  getThreadAnalysesRoute,
  getThreadBySlugRoute,
  getThreadChangelogRoute,
  getThreadFeedbackRoute,
  getThreadMessagesRoute,
  getThreadPreSearchesRoute,
  getThreadRoute,
  getThreadSlugStatusRoute,
  getThreadStreamResumptionStateRoute,
  listCustomRolesRoute,
  listThreadsRoute,
  resumeAnalysisStreamRoute,
  resumeStreamRoute,
  resumeThreadStreamRoute,
  setRoundFeedbackRoute,
  streamChatRoute,
  updateCustomRoleRoute,
  updateParticipantRoute,
  updateThreadRoute,
} from './routes/chat/route';
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
// Step 1: Create the main OpenAPIHono app with defaultHook (following docs)
// ============================================================================

const app = createOpenApiApp();

// ============================================================================
// Step 2: Apply global middleware (following Hono patterns)
// ============================================================================

// Formatting
app.use('*', prettyJSON());
app.use('*', trimTrailingSlash());

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
// 📍 Next.js Pages: next.config.ts handles CSP
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

// CORS configuration - Use environment variables for dynamic origin configuration
app.use('*', (c, next) => {
  // CRITICAL FIX: Use process.env fallback for Next.js dev mode
  // In Cloudflare Workers: c.env has the bindings
  // In Next.js dev: c.env may be empty, use process.env
  const appUrl = c.env?.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const webappEnv = c.env?.NEXT_PUBLIC_WEBAPP_ENV || process.env.NEXT_PUBLIC_WEBAPP_ENV || 'local';
  const nodeEnv = c.env?.NODE_ENV || process.env.NODE_ENV;
  const isDevelopment = webappEnv === 'local' || nodeEnv === 'development';

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
// GET /chat/threads - list threads (requires auth, no CSRF for safe method)
app.on('POST', '/chat/threads', csrfProtection, requireSession);
app.on('GET', '/chat/threads', requireSession);

// POST /chat - stream AI response (AI SDK v5 pattern - requires auth + CSRF)
// This is the OFFICIAL AI SDK endpoint for streaming chat responses
app.on('POST', '/chat', csrfProtection, requireSession);

// /chat/threads/:id - mixed access pattern
// GET: public access for public threads (handler checks ownership/public status)
// PATCH/DELETE: protected mutations (requires auth + CSRF)
app.use('/chat/threads/:id', protectMutations);

// GET /chat/threads/slug/:slug - get thread by slug (requires auth)
app.use('/chat/threads/slug/:slug', requireSession);

// GET /chat/threads/:id/messages - get messages (requires auth)
app.use('/chat/threads/:id/messages', requireSession);

// GET /chat/threads/:id/changelog - get thread configuration changelog (requires auth)
app.use('/chat/threads/:id/changelog', requireSession);

// GET /chat/threads/:id/slug-status - poll for slug updates (requires auth)
app.use('/chat/threads/:id/slug-status', requireSession);

// Participant management routes (protected)
app.use('/chat/threads/:id/participants', csrfProtection, requireSession);
app.use('/chat/participants/:id', csrfProtection, requireSession);

// Custom role routes (protected)
app.use('/chat/custom-roles', csrfProtection, requireSession);
app.use('/chat/custom-roles/:id', csrfProtection, requireSession);

// Pre-search routes (protected)
app.use('/chat/threads/:threadId/rounds/:roundNumber/pre-search', csrfProtection, requireSession);
app.use('/chat/threads/:id/pre-searches', requireSession); // GET pre-searches for thread

// Moderator analysis routes (protected)
app.use('/chat/threads/:threadId/rounds/:roundNumber/analyze', csrfProtection, requireSession);
app.use('/chat/threads/:threadId/rounds/:roundNumber/analyze/resume', requireSession); // GET resume (no CSRF for safe method)
app.use('/chat/threads/:id/analyses', requireSession); // GET analyses for thread

// Round feedback routes (protected)
app.use('/chat/threads/:threadId/rounds/:roundNumber/feedback', csrfProtection, requireSession);
app.use('/chat/threads/:id/feedback', requireSession); // GET feedback for thread

// Project routes (protected)
app.use('/projects', csrfProtection, requireSession);
app.use('/projects/:id', protectMutations);
app.use('/projects/:id/knowledge', csrfProtection, requireSession);
app.use('/projects/:id/knowledge/:fileId', csrfProtection, requireSession);

// Upload routes (protected - file attachments for chat)
// NOTE: Download routes have separate rate limiting - don't apply upload rate limiter to them
app.use('/uploads', async (c, next) => {
  // Skip rate limiting for download routes - they have their own rate limiter
  if (c.req.path.includes('/download')) {
    return next();
  }
  return RateLimiterFactory.create('upload')(c, next);
}, csrfProtection, async (c, next) => {
  // Skip session requirement for download routes - they use signed URLs
  if (c.req.path.includes('/download')) {
    return next();
  }
  return requireSession(c, next);
});
app.use('/uploads/ticket', RateLimiterFactory.create('upload'), csrfProtection, requireSession);
app.use('/uploads/ticket/upload', RateLimiterFactory.create('upload'), csrfProtection, requireSession);
app.use('/uploads/:id', protectMutations);
app.use('/uploads/:id/download', RateLimiterFactory.create('download')); // Download has its own rate limit + session-optional auth
app.use('/uploads/:id/download-url', RateLimiterFactory.create('download'), requireSession);
app.use('/uploads/multipart', RateLimiterFactory.create('upload'), csrfProtection, requireSession);
app.use('/uploads/multipart/:id', protectMutations);
app.use('/uploads/multipart/:id/parts', RateLimiterFactory.create('upload'), csrfProtection, requireSession);
app.use('/uploads/multipart/:id/complete', RateLimiterFactory.create('upload'), csrfProtection, requireSession);

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
  .openapi(getThreadSlugStatusRoute, getThreadSlugStatusHandler) // Poll for AI-generated slug updates
  .openapi(updateThreadRoute, updateThreadHandler) // Update thread (title, mode, status, metadata)
  .openapi(deleteThreadRoute, deleteThreadHandler) // Delete thread (soft delete)
  .openapi(getPublicThreadRoute, getPublicThreadHandler) // Get public thread by slug (no auth)
  // Message Management
  .openapi(getThreadMessagesRoute, getThreadMessagesHandler) // Get thread messages
  .openapi(getThreadChangelogRoute, getThreadChangelogHandler) // Get configuration changelog
  .openapi(streamChatRoute, streamChatHandler) // Stream AI responses via SSE
  .openapi(getStreamStatusRoute, getStreamStatusHandler) // Check participant stream status for resumption
  .openapi(resumeStreamRoute, resumeStreamHandler) // Resume buffered participant stream
  .openapi(resumeThreadStreamRoute, resumeThreadStreamHandler) // Resume active thread stream (AI SDK pattern)
  .openapi(getThreadStreamResumptionStateRoute, getThreadStreamResumptionStateHandler) // Get stream resumption state for server-side prefetching
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
  // Pre-search (protected, web search results)
  .openapi(getThreadPreSearchesRoute, getThreadPreSearchesHandler) // Get all pre-search results for thread
  .openapi(createPreSearchRoute, createPreSearchHandler) // Create PENDING pre-search record (fixes web search ordering)
  .openapi(executePreSearchRoute, executePreSearchHandler) // Stream pre-search execution
  // Moderator Analysis (protected, backend-triggered only)
  .openapi(getThreadAnalysesRoute, getThreadAnalysesHandler) // Get persisted moderator analyses (read-only)
  .openapi(analyzeRoundRoute, analyzeRoundHandler) // Stream moderator analysis for a round
  .openapi(resumeAnalysisStreamRoute, resumeAnalysisStreamHandler) // Resume buffered analysis stream
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
appRoutes.get('/openapi.json', async (c) => {
  // Redirect to the existing doc endpoint which contains the full OpenAPI spec
  return c.redirect('/api/v1/doc');
});

// ============================================================================
// Step 7: Additional endpoints (Scalar UI, LLMs, etc.)
// ============================================================================

// Scalar API documentation UI
// CSP headers set directly in Hono since Next.js headers() don't apply to Hono routes in Cloudflare Workers
// Middleware to set permissive CSP for Scalar before the response is generated
appRoutes.use('/scalar', async (c, next) => {
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

export default appRoutes;

// ============================================================================
// Cloudflare Workflows - REMOVED
// ============================================================================

// Workflows have been removed in favor of user-initiated streaming analysis
// Analysis is now triggered exclusively via POST /chat/threads/:id/rounds/:roundNumber/analyze
