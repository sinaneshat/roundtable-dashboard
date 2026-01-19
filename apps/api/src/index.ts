/**
 * Roundtable API - Hono Zod OpenAPI Implementation
 *
 * This file follows the EXACT pattern from the official Hono Zod OpenAPI documentation.
 * It provides full type safety and automatic RPC client type inference.
 *
 * IMPORTANT: Uses async factory pattern to avoid Cloudflare Workers startup CPU limit.
 * All heavy modules (routes, schemas, services) are loaded lazily on first request.
 *
 * @see https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time
 */

// ============================================================================
// LIGHTWEIGHT IMPORTS - Safe for module-level (types, constants, core Hono)
// ============================================================================
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
import { attachSession, csrfProtection, errorLogger, performanceTracking, RateLimiterFactory, requestLogger } from './middleware';

// ============================================================================
// Environment Detection (sync, build-time check)
// ============================================================================
const WEBAPP_ENV = process.env.WEBAPP_ENV || 'development';
const IS_DEV_ENVIRONMENT = WEBAPP_ENV === 'local' || WEBAPP_ENV === 'development' || WEBAPP_ENV === 'preview';

// ============================================================================
// Async Factory Function - Defers heavy imports to first request
// ============================================================================

/**
 * Creates the Hono app with all routes.
 * Called lazily on first request to avoid startup CPU limit.
 */
export async function createApp() {
  // ============================================================================
  // HEAVY IMPORTS - Loaded on first request, not at startup
  // ============================================================================

  // Middleware that imports heavy services
  const { ensureOpenRouterInitialized, ensureStripeInitialized } = await import('./middleware');

  // API Keys routes
  const {
    createApiKeyHandler,
    deleteApiKeyHandler,
    getApiKeyHandler,
    listApiKeysHandler,
    updateApiKeyHandler,
  } = await import('./routes/api-keys/handler');
  const {
    createApiKeyRoute,
    deleteApiKeyRoute,
    getApiKeyRoute,
    listApiKeysRoute,
    updateApiKeyRoute,
  } = await import('./routes/api-keys/route');

  // Auth routes
  const { secureMeHandler } = await import('./routes/auth/handler');
  const { secureMeRoute } = await import('./routes/auth/route');

  // Billing routes
  const {
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
  } = await import('./routes/billing/handler');
  const {
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
  } = await import('./routes/billing/route');

  // Chat routes
  const {
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
  } = await import('./routes/chat');
  const {
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
  } = await import('./routes/chat/route');

  // Credits routes
  const {
    estimateCreditCostHandler,
    getCreditBalanceHandler,
    getCreditTransactionsHandler,
  } = await import('./routes/credits/handler');
  const {
    estimateCreditCostRoute,
    getCreditBalanceRoute,
    getCreditTransactionsRoute,
  } = await import('./routes/credits/route');

  // MCP routes
  const {
    callToolHandler,
    listResourcesHandler,
    listToolsHandler,
    mcpJsonRpcHandler,
    openAIFunctionsHandler,
  } = await import('./routes/mcp/handler');
  const {
    callToolRoute,
    listResourcesRoute,
    listToolsRoute,
    mcpJsonRpcRoute,
    openAIFunctionsRoute,
  } = await import('./routes/mcp/route');

  // Models routes
  const { listModelsHandler } = await import('./routes/models/handler');
  const { listModelsRoute } = await import('./routes/models/route');

  // OG Image routes
  const { ogImageHandler } = await import('./routes/og/handler');
  const { ogImageRoute } = await import('./routes/og/route');

  // Project routes
  const {
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
  } = await import('./routes/project/handler');
  const {
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
  } = await import('./routes/project/route');

  // System/health routes
  const {
    benchmarkHandler,
    clearCacheHandler,
    detailedHealthHandler,
    healthHandler,
  } = await import('./routes/system/handler');
  const {
    benchmarkRoute,
    clearCacheRoute,
    detailedHealthRoute,
    healthRoute,
  } = await import('./routes/system/route');

  // Test routes
  const { setUserCreditsHandler } = await import('./routes/test/handler');
  const { setUserCreditsRoute } = await import('./routes/test/route');

  // Upload routes
  const {
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
  } = await import('./routes/uploads/handler');
  const {
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
  } = await import('./routes/uploads/route');

  // Usage routes
  const { getUserUsageStatsHandler } = await import('./routes/usage/handler');
  const { getUserUsageStatsRoute } = await import('./routes/usage/route');

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
  app.use('*', secureHeaders({
    contentSecurityPolicy: {},
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

  // Body limit
  app.use('*', async (c, next) => {
    if (c.req.path.startsWith('/uploads')) {
      return next();
    }
    return bodyLimit({
      maxSize: 5 * 1024 * 1024,
      onError: c => c.text('Payload Too Large', 413),
    })(c, next);
  });

  app.use('/uploads', bodyLimit({
    maxSize: 100 * 1024 * 1024,
    onError: c => c.text('Payload Too Large - max 100MB for uploads', 413),
  }));

  // CORS
  app.use('*', async (c, next) => {
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
  const publicPrefixes = ['/chat/public/', '/system/', '/webhooks/', '/_next/', '/static/'];
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
    .openapi(ogImageRoute, ogImageHandler)
    .openapi(healthRoute, healthHandler)
    .openapi(detailedHealthRoute, detailedHealthHandler);

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
  // Step 6: OpenAPI documentation endpoints
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

  finalRoutes.get('/scalar', async (c, next) => {
    const { apiReference } = await import('@scalar/hono-api-reference');
    const middleware = apiReference({ url: '/api/v1/doc' });
    return middleware(c as Parameters<typeof middleware>[0], next);
  });

  finalRoutes.get('/llms.txt', async (c) => {
    try {
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
  // Step 7: Create root app with /api/v1 basePath
  // ============================================================================

  const rootApp = new Hono<ApiEnv>();

  // Better Auth handler with inline CORS
  rootApp.all('/api/auth/*', async (c) => {
    // Handle CORS
    const allowedOrigins = getAllowedOriginsFromContext(c);
    const origin = c.req.header('origin');

    if (origin && allowedOrigins.includes(origin)) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Pragma');
    }

    // Handle OPTIONS preflight
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }

    // Auth handler
    const { auth } = await import('@/lib/auth/server');
    return auth.handler(c.req.raw);
  });

  // Mount API routes
  rootApp.route('/api/v1', finalRoutes);

  return rootApp;
}

// ============================================================================
// AppType Export for RPC Client Type Inference
// ============================================================================

/**
 * AppType is inferred from the return type of createApp().
 * This maintains full type safety for RPC clients.
 */
export type AppType = Awaited<ReturnType<typeof createApp>>;
