/**
 * Roundtable API - Hono Zod OpenAPI Implementation
 *
 * This file follows the EXACT pattern from the official Hono Zod OpenAPI documentation.
 * It provides full type safety and automatic RPC client type inference.
 *
 * IMPORTANT: All routes MUST use createOpenApiApp() pattern for RPC type safety.
 * Never use createRoute directly in route handlers - always use OpenAPIHono apps.
 */

import { WebAppEnvs } from '@roundtable/shared';
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
import { attachSession, csrfProtection, ensureOpenRouterInitialized, ensureStripeInitialized, errorLogger, performanceTracking, RateLimiterFactory, requestLogger } from './middleware';
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
// PostHog proxy (analytics ad-blocker bypass)
import { ingestProxyHandler } from './routes/ingest';
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
// OG image routes
import { ogChatHandler, ogChatRoute } from './routes/og';
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
// WEBAPP_ENV values: 'local' | 'preview' | 'prod' (from wrangler.jsonc)
// ============================================================================
const WEBAPP_ENV = process.env.WEBAPP_ENV || WebAppEnvs.LOCAL;
const IS_DEV_ENVIRONMENT = WEBAPP_ENV === WebAppEnvs.LOCAL || WEBAPP_ENV === WebAppEnvs.PREVIEW;

// ============================================================================
// Step 1: Create the main OpenAPIHono app with defaultHook (following docs)
// ============================================================================

const app = createOpenApiApp();

// ============================================================================
// Step 2: Apply global middleware (following Hono patterns)
// ============================================================================

// 🔍 DEBUG: Log ALL requests (especially POST) to diagnose 400 errors
if (process.env.DEBUG_REQUESTS === 'true') {
  app.use('*', async (c, next) => {
    const startTime = Date.now();
    const method = c.req.method;
    const path = c.req.path;

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

// Performance tracking (preview/local only)
app.use('*', performanceTracking);

// Request logging (all environments - structured JSON for Cloudflare Workers Logs)
app.use('*', requestLogger);

// Core middleware
app.use('*', contextStorage());

// Security headers
// crossOriginResourcePolicy: 'cross-origin' allows OG images to be loaded cross-origin
// The OG preview in ShareDialog loads from API origin (8787) while frontend is on (5173)
app.use('*', secureHeaders({
  contentSecurityPolicy: {},
  crossOriginResourcePolicy: 'cross-origin',
}));

app.use('*', requestId());
app.use('*', timing());

// Timeout for non-streaming routes
app.use('*', async (c, next) => {
  if (c.req.path.includes('/stream') || c.req.path.includes('/moderator') || c.req.path.includes('/chat')) {
    return next();
  }
  return timeout(30000)(c, next);
});

// Body limit - default 5MB, uploads get 100MB
app.use('*', async (c, next) => {
  const path = c.req.path;
  if (path.includes('/uploads')) {
    return next();
  }
  return bodyLimit({
    maxSize: 5 * 1024 * 1024,
    onError: c => c.text('Payload Too Large', 413),
  })(c, next);
});

// 100MB limit for file uploads
app.use('*', async (c, next) => {
  const path = c.req.path;
  if (!path.includes('/uploads')) {
    return next();
  }
  return bodyLimit({
    maxSize: 100 * 1024 * 1024,
    onError: c => c.text('Payload Too Large - max 100MB for uploads', 413),
  })(c, next);
});

// CORS
app.use('*', async (c, next) => {
  // OG images need to be accessible from ANY origin (social media crawlers, external sites)
  // Use includes() to match /og/ regardless of path prefix (handles both /og/chat and /api/v1/og/chat)
  if (c.req.path.includes('/og/')) {
    return cors({
      origin: '*',
      credentials: false, // * origin cannot use credentials
      allowMethods: ['GET', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
    })(c, next);
  }

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

// ETag support
app.use('*', async (c, next) => {
  if (c.req.path.includes('/stream') || c.req.path.includes('/chat') || c.req.path.includes('/moderator')) {
    return next();
  }
  return etag()(c, next);
});

// Session attachment - optimized with prefix-based routing
const publicPrefixes = ['/chat/public/', '/system/', '/webhooks/', '/_next/', '/static/', '/og/'];
const staticExtensions = ['.ico', '.png', '.jpg', '.svg'];
const docPaths = ['/health', '/api/v1/health', '/doc', '/openapi.json', '/scalar', '/llms.txt'];

app.use('*', async (c, next) => {
  const path = c.req.path;

  if (publicPrefixes.some(prefix => path.startsWith(prefix))) {
    c.set('session', null);
    c.set('user', null);
    return next();
  }

  if (staticExtensions.some(ext => path.endsWith(ext))) {
    c.set('session', null);
    c.set('user', null);
    return next();
  }

  if (docPaths.includes(path)) {
    c.set('session', null);
    c.set('user', null);
    return next();
  }

  if ((path.startsWith('/billing/products') || path === '/models') && c.req.method === 'GET') {
    c.set('session', null);
    c.set('user', null);
    return next();
  }

  const handlerAuthPrefixes = [
    '/chat',
    '/usage/',
    '/uploads/',
    '/api-keys/',
    '/projects/',
    '/mcp/',
    '/billing/',
    '/credits/',
  ];

  if (handlerAuthPrefixes.some(prefix => path.startsWith(prefix))) {
    c.set('session', null);
    c.set('user', null);
    return next();
  }

  return attachSession(c, next);
});

// Stripe/OpenRouter initialization
app.use('/billing/*', ensureStripeInitialized);
app.use('/webhooks/stripe', ensureStripeInitialized);
app.use('/chat/*', ensureOpenRouterInitialized);
app.use('/mcp/*', ensureOpenRouterInitialized);

// Global rate limiting
app.use('*', RateLimiterFactory.create('api'));

// ============================================================================
// Step 3: Configure error and not-found handlers
// ============================================================================

app.onError(errorLogger);
app.notFound(notFound);

// ============================================================================
// Step 4: CSRF Protection for Mutation Routes
// ============================================================================

app.use('/auth/me', csrfProtection);
app.use('/auth/api-keys', csrfProtection);

app.use('/billing/checkout', csrfProtection);
app.use('/billing/portal', csrfProtection);
app.use('/billing/sync-after-checkout', csrfProtection);
app.use('/billing/sync-credits-after-checkout', csrfProtection);
app.use('/billing/subscriptions', csrfProtection);
app.use('/billing/subscriptions/:id', csrfProtection);
app.use('/billing/subscriptions/:id/switch', csrfProtection);
app.use('/billing/subscriptions/:id/cancel', csrfProtection);

if (process.env.NODE_ENV !== 'production') {
  app.use('/test/*', csrfProtection);
}

app.on('POST', '/chat/threads', csrfProtection);
app.on('POST', '/chat', csrfProtection);
app.on(['PATCH', 'DELETE'], '/chat/threads/:id', csrfProtection);

app.use('/chat/threads/:id/participants', csrfProtection);
app.use('/chat/participants/:id', csrfProtection);

app.use('/chat/custom-roles', csrfProtection);
app.use('/chat/custom-roles/:id', csrfProtection);

app.on('POST', '/chat/threads/:threadId/rounds/:roundNumber/pre-search', csrfProtection);
app.on('POST', '/chat/threads/:threadId/rounds/:roundNumber/moderator', csrfProtection);
app.on('POST', '/chat/threads/:threadId/rounds/:roundNumber/feedback', csrfProtection);

app.use('/projects', csrfProtection);
app.on(['PATCH', 'DELETE'], '/projects/:id', csrfProtection);
app.use('/projects/:id/knowledge', csrfProtection);
app.use('/projects/:id/knowledge/:fileId', csrfProtection);

app.use('/uploads', async (c, next) => {
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

// ============================================================================
// Step 5: Register all routes
// ============================================================================

let routeChain = app
  .openapi(healthRoute, healthHandler)
  .openapi(detailedHealthRoute, detailedHealthHandler)
  .openapi(ogChatRoute, ogChatHandler);

if (IS_DEV_ENVIRONMENT) {
  routeChain = routeChain
    .openapi(clearCacheRoute, clearCacheHandler)
    .openapi(benchmarkRoute, benchmarkHandler);
}

const appRoutes = routeChain
  .openapi(secureMeRoute, secureMeHandler)
  .openapi(listApiKeysRoute, listApiKeysHandler)
  .openapi(getApiKeyRoute, getApiKeyHandler)
  .openapi(createApiKeyRoute, createApiKeyHandler)
  .openapi(updateApiKeyRoute, updateApiKeyHandler)
  .openapi(deleteApiKeyRoute, deleteApiKeyHandler)
  .openapi(listProductsRoute, listProductsHandler)
  .openapi(getProductRoute, getProductHandler)
  .openapi(createCheckoutSessionRoute, createCheckoutSessionHandler)
  .openapi(createCustomerPortalSessionRoute, createCustomerPortalSessionHandler)
  .openapi(syncAfterCheckoutRoute, syncAfterCheckoutHandler)
  .openapi(syncCreditsAfterCheckoutRoute, syncCreditsAfterCheckoutHandler)
  .openapi(listSubscriptionsRoute, listSubscriptionsHandler)
  .openapi(getSubscriptionRoute, getSubscriptionHandler)
  .openapi(switchSubscriptionRoute, switchSubscriptionHandler)
  .openapi(cancelSubscriptionRoute, cancelSubscriptionHandler)
  .openapi(handleWebhookRoute, handleWebhookHandler)
  .openapi(listThreadsRoute, listThreadsHandler)
  .openapi(listSidebarThreadsRoute, listSidebarThreadsHandler)
  .openapi(createThreadRoute, createThreadHandler)
  .openapi(getThreadRoute, getThreadHandler)
  .openapi(getThreadBySlugRoute, getThreadBySlugHandler)
  .openapi(getThreadSlugStatusRoute, getThreadSlugStatusHandler)
  .openapi(updateThreadRoute, updateThreadHandler)
  .openapi(deleteThreadRoute, deleteThreadHandler)
  .openapi(getPublicThreadRoute, getPublicThreadHandler)
  .openapi(listPublicThreadSlugsRoute, listPublicThreadSlugsHandler)
  .openapi(getThreadMessagesRoute, getThreadMessagesHandler)
  .openapi(getThreadChangelogRoute, getThreadChangelogHandler)
  .openapi(getThreadRoundChangelogRoute, getThreadRoundChangelogHandler)
  .openapi(streamChatRoute, streamChatHandler)
  .openapi(resumeThreadStreamRoute, resumeThreadStreamHandler)
  .openapi(getThreadStreamResumptionStateRoute, getThreadStreamResumptionStateHandler)
  .openapi(addParticipantRoute, addParticipantHandler)
  .openapi(updateParticipantRoute, updateParticipantHandler)
  .openapi(deleteParticipantRoute, deleteParticipantHandler)
  .openapi(analyzePromptRoute, analyzePromptHandler)
  .openapi(listCustomRolesRoute, listCustomRolesHandler)
  .openapi(createCustomRoleRoute, createCustomRoleHandler)
  .openapi(getCustomRoleRoute, getCustomRoleHandler)
  .openapi(updateCustomRoleRoute, updateCustomRoleHandler)
  .openapi(deleteCustomRoleRoute, deleteCustomRoleHandler)
  .openapi(listUserPresetsRoute, listUserPresetsHandler)
  .openapi(createUserPresetRoute, createUserPresetHandler)
  .openapi(getUserPresetRoute, getUserPresetHandler)
  .openapi(updateUserPresetRoute, updateUserPresetHandler)
  .openapi(deleteUserPresetRoute, deleteUserPresetHandler)
  .openapi(getThreadPreSearchesRoute, getThreadPreSearchesHandler)
  .openapi(executePreSearchRoute, executePreSearchHandler)
  .openapi(councilModeratorRoundRoute, councilModeratorRoundHandler)
  .openapi(getRoundStatusRoute, getRoundStatusHandler)
  .openapi(setRoundFeedbackRoute, setRoundFeedbackHandler)
  .openapi(getThreadFeedbackRoute, getThreadFeedbackHandler)
  .openapi(listProjectsRoute, listProjectsHandler)
  .openapi(createProjectRoute, createProjectHandler)
  .openapi(getProjectRoute, getProjectHandler)
  .openapi(updateProjectRoute, updateProjectHandler)
  .openapi(deleteProjectRoute, deleteProjectHandler)
  .openapi(listProjectAttachmentsRoute, listProjectAttachmentsHandler)
  .openapi(addAttachmentToProjectRoute, addAttachmentToProjectHandler)
  .openapi(getProjectAttachmentRoute, getProjectAttachmentHandler)
  .openapi(updateProjectAttachmentRoute, updateProjectAttachmentHandler)
  .openapi(removeAttachmentFromProjectRoute, removeAttachmentFromProjectHandler)
  .openapi(listProjectMemoriesRoute, listProjectMemoriesHandler)
  .openapi(createProjectMemoryRoute, createProjectMemoryHandler)
  .openapi(getProjectMemoryRoute, getProjectMemoryHandler)
  .openapi(updateProjectMemoryRoute, updateProjectMemoryHandler)
  .openapi(deleteProjectMemoryRoute, deleteProjectMemoryHandler)
  .openapi(getProjectContextRoute, getProjectContextHandler)
  .openapi(getUserUsageStatsRoute, getUserUsageStatsHandler)
  .openapi(getCreditBalanceRoute, getCreditBalanceHandler)
  .openapi(getCreditTransactionsRoute, getCreditTransactionsHandler)
  .openapi(estimateCreditCostRoute, estimateCreditCostHandler);

let creditsChain = appRoutes;
if (IS_DEV_ENVIRONMENT) {
  creditsChain = creditsChain.openapi(setUserCreditsRoute, setUserCreditsHandler);
}

const finalRoutes = creditsChain
  .openapi(listModelsRoute, listModelsHandler)
  .openapi(mcpJsonRpcRoute, mcpJsonRpcHandler)
  .openapi(listToolsRoute, listToolsHandler)
  .openapi(listResourcesRoute, listResourcesHandler)
  .openapi(callToolRoute, callToolHandler)
  .openapi(openAIFunctionsRoute, openAIFunctionsHandler)
  .openapi(listUploadsRoute, listUploadsHandler)
  .openapi(getUploadRoute, getUploadHandler)
  .openapi(getDownloadUrlRoute, getDownloadUrlHandler)
  .openapi(downloadUploadRoute, downloadUploadHandler)
  .openapi(updateUploadRoute, updateUploadHandler)
  .openapi(deleteUploadRoute, deleteUploadHandler)
  .openapi(requestUploadTicketRoute, requestUploadTicketHandler)
  .openapi(uploadWithTicketRoute, uploadWithTicketHandler)
  .openapi(createMultipartUploadRoute, createMultipartUploadHandler)
  .openapi(uploadPartRoute, uploadPartHandler)
  .openapi(completeMultipartUploadRoute, completeMultipartUploadHandler)
  .openapi(abortMultipartUploadRoute, abortMultipartUploadHandler);

// ============================================================================
// Step 6: Export AppType for RPC client type inference
// ============================================================================

export type AppType = typeof finalRoutes;

// ============================================================================
// Step 7: OpenAPI documentation endpoints
// ============================================================================

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

finalRoutes.get('/openapi.json', async (c) => {
  return c.redirect('/api/v1/doc');
});

// Scalar UI with CSP
finalRoutes.use('/scalar', async (c, next) => {
  await next();

  const response = c.res;
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

  const newHeaders = new Headers(response.headers);
  newHeaders.set('Content-Security-Policy', csp);

  c.res = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
});

// Scalar API docs - loaded from CDN, not bundled
finalRoutes.get('/scalar', (c) => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>API Reference</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script id="api-reference" data-url="/api/v1/doc"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
  return c.html(html);
});

// LLMs.txt - OpenAPI as markdown (no external deps, uses built-in JSON)
finalRoutes.get('/llms.txt', async (c) => {
  try {
    const document = finalRoutes.getOpenAPI31Document({
      openapi: '3.1.0',
      info: { title: 'Application API', version: APP_VERSION },
    });
    // Simple markdown conversion without external deps
    const md = `# API Documentation\n\n${JSON.stringify(document, null, 2)}`;
    return c.text(md);
  } catch {
    return c.text('LLMs document unavailable');
  }
});

// ============================================================================
// Step 8: Create root app with /api/v1 basePath and Better Auth handler
// ============================================================================

const rootApp = new Hono<ApiEnv>();

// Debug endpoint for preview troubleshooting
rootApp.get('/debug/env', (c) => {
  const nodeEnv = c.env?.NODE_ENV || process.env.NODE_ENV;
  const webappEnv = c.env?.WEBAPP_ENV || process.env.WEBAPP_ENV;
  const betterAuthUrl = c.env?.BETTER_AUTH_URL || process.env.BETTER_AUTH_URL;

  return c.json({
    nodeEnv,
    webappEnv,
    betterAuthUrl,
    isProductionMode: nodeEnv === 'production',
    allowedOrigins: getAllowedOriginsFromContext(c),
    timestamp: new Date().toISOString(),
  });
});

// Debug cookie test endpoint
rootApp.get('/debug/cookie-test', (c) => {
  const origin = c.req.header('origin');
  const allowedOrigins = getAllowedOriginsFromContext(c);

  if (origin && allowedOrigins.includes(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
  }

  const nodeEnv = c.env?.NODE_ENV || process.env.NODE_ENV;
  const isProduction = nodeEnv === 'production';

  c.header(
    'Set-Cookie',
    `test-cookie=hello-${Date.now()}; Path=/; ${isProduction ? 'Secure; ' : ''}SameSite=Lax; Domain=${isProduction ? '.roundtable.now' : ''}; HttpOnly`,
  );

  return c.json({
    message: 'Cookie set',
    isProduction,
    domain: isProduction ? '.roundtable.now' : 'none',
    requestCookies: c.req.header('cookie') || 'none',
  });
});

// PostHog reverse proxy - bypasses ad blockers by routing through our domain
// No auth required, handles /ingest/* and /ingest/static/*
rootApp.all('/ingest/*', ingestProxyHandler);

// Better Auth handler with inline CORS
rootApp.all('/api/auth/*', async (c) => {
  const allowedOrigins = getAllowedOriginsFromContext(c);
  const origin = c.req.header('origin');

  if (c.req.method === 'OPTIONS') {
    const headers = new Headers();
    if (origin && allowedOrigins.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Credentials', 'true');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma');
    }
    return new Response(null, { status: 204, headers });
  }

  try {
    const { auth } = await import('@/lib/auth/server');
    const response = await auth.handler(c.req.raw);

    const newHeaders = new Headers(response.headers);
    if (origin && allowedOrigins.includes(origin)) {
      newHeaders.set('Access-Control-Allow-Origin', origin);
      newHeaders.set('Access-Control-Allow-Credentials', 'true');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma');
    }

    // Log 500 errors from Better Auth for debugging
    if (response.status >= 500) {
      const clonedResponse = response.clone();
      try {
        const body = await clonedResponse.text();
        console.error({
          log_type: 'better_auth_error',
          timestamp: new Date().toISOString(),
          path: c.req.path,
          status: response.status,
          body: body.slice(0, 1000),
        });
      } catch {
        // Ignore clone errors
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch (error) {
    console.error({
      log_type: 'better_auth_exception',
      timestamp: new Date().toISOString(),
      path: c.req.path,
      error_name: error instanceof Error ? error.name : 'Unknown',
      error_message: error instanceof Error ? error.message : String(error),
      error_stack: error instanceof Error ? error.stack : undefined,
    });

    const headers = new Headers();
    if (origin && allowedOrigins.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Credentials', 'true');
    }
    headers.set('Content-Type', 'application/json');

    return new Response(
      JSON.stringify({ error: 'Authentication service error' }),
      { status: 500, headers },
    );
  }
});

// Mount API routes
rootApp.route('/api/v1', finalRoutes);

// ============================================================================
// Step 9: Export for Cloudflare Workers
// ============================================================================

export default rootApp;
