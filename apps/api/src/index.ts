/**
 * Roundtable API - Hono Zod OpenAPI Implementation
 *
 * This file follows the EXACT pattern from the official Hono Zod OpenAPI documentation.
 * It provides full type safety and automatic RPC client type inference.
 *
 * IMPORTANT: All routes MUST use createOpenApiApp() pattern for RPC type safety.
 * Never use createRoute directly in route handlers - always use OpenAPIHono apps.
 *
 * Route groups are used to split the type inference chain to avoid TS7056 error.
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
import { attachSession, csrfProtection, ensureOpenRouterInitialized, ensureStripeInitialized, errorLogger, performanceTracking, RateLimiterFactory, requestLogger } from './middleware';
// Routes - types are re-exported below
import { apiRoutes } from './routes';
// PostHog proxy (analytics ad-blocker bypass)
import { ingestProxyHandler } from './routes/ingest';

// ============================================================================
// Step 1: Create the main OpenAPIHono app with defaultHook (following docs)
// ============================================================================

const app = createOpenApiApp();

// ============================================================================
// Step 2: Apply global middleware (following Hono patterns)
// ============================================================================

// DEBUG: Log ALL requests (especially POST) to diagnose 400 errors
if (process.env['DEBUG_REQUESTS'] === 'true') {
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
          bodyLength: bodyText.length,
          bodyPreview: bodyText.slice(0, 300),
          contentLength,
          contentType,
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
    return await next();
  }
  return await timeout(30000)(c, next);
});

// Body limit - default 5MB, uploads get 100MB
app.use('*', async (c, next) => {
  const path = c.req.path;
  if (path.includes('/uploads')) {
    return await next();
  }
  return await bodyLimit({
    maxSize: 5 * 1024 * 1024,
    onError: c => c.text('Payload Too Large', 413),
  })(c, next);
});

// 100MB limit for file uploads
app.use('*', async (c, next) => {
  const path = c.req.path;
  if (!path.includes('/uploads')) {
    return await next();
  }
  return await bodyLimit({
    maxSize: 100 * 1024 * 1024,
    onError: c => c.text('Payload Too Large - max 100MB for uploads', 413),
  })(c, next);
});

// CORS
app.use('*', async (c, next) => {
  // OG images need to be accessible from ANY origin (social media crawlers, external sites)
  // Use includes() to match /og/ regardless of path prefix (handles both /og/chat and /api/v1/og/chat)
  if (c.req.path.includes('/og/')) {
    return await cors({
      allowHeaders: ['Content-Type'],
      allowMethods: ['GET', 'OPTIONS'],
      credentials: false, // * origin cannot use credentials
      origin: '*',
    })(c, next);
  }

  const allowedOrigins = getAllowedOriginsFromContext(c);

  const middleware = cors({
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cache-Control', 'Pragma'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    credentials: true,
    origin: (origin) => {
      if (!origin) {
        return origin;
      }
      return allowedOrigins.includes(origin) ? origin : null;
    },
  });
  return await middleware(c, next);
});

// ETag support
app.use('*', async (c, next) => {
  if (c.req.path.includes('/stream') || c.req.path.includes('/chat') || c.req.path.includes('/moderator')) {
    return await next();
  }
  return await etag()(c, next);
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
    return await next();
  }

  if (staticExtensions.some(ext => path.endsWith(ext))) {
    c.set('session', null);
    c.set('user', null);
    return await next();
  }

  if (docPaths.includes(path)) {
    c.set('session', null);
    c.set('user', null);
    return await next();
  }

  if ((path.startsWith('/billing/products') || path === '/models') && c.req.method === 'GET') {
    c.set('session', null);
    c.set('user', null);
    return await next();
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
    return await next();
  }

  return await attachSession(c, next);
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
app.use('/auth/clear-cache', csrfProtection);
app.use('/auth/api-keys', csrfProtection);

// Admin routes CSRF protection
app.use('/admin/users/clear-cache', csrfProtection);
app.use('/admin/jobs', csrfProtection);
app.on(['PATCH', 'DELETE'], '/admin/jobs/:id', csrfProtection);

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
    return await next();
  }
  return await RateLimiterFactory.create('upload')(c, next);
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
// Step 5: Mount routes using .route()
// All routes are registered in routes/index.ts with chained .openapi() calls
// for full Hono RPC type inference.
// ============================================================================

// Mount all API routes at root path (routes define their own paths)
app.route('/', apiRoutes);

// ============================================================================
// Step 6: Re-export route types for RPC client type inference
// Individual route group types are exported for modular client usage.
// AppType is the intersection of all groups for unified client usage.
// ============================================================================

export type {
  AdminRoutesType,
  AppType,
  BillingRoutesType,
  ChatFeatureRoutesType,
  ChatMessageRoutesType,
  ChatThreadRoutesType,
  // Individual route group types for modular clients
  HealthAuthRoutesType,
  ProjectRoutesType,
  TestRoutesType,
  UploadRoutesType,
  UtilityRoutesType,
} from './routes';

// ============================================================================
// Step 7: OpenAPI documentation endpoints
// ============================================================================

app.doc('/doc', c => ({
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        in: 'header',
        name: 'x-api-key',
        type: 'apiKey',
      },
    },
  },
  info: {
    contact: { name: 'Roundtable', url: 'https://roundtable.now' },
    description: 'roundtable.now API - Collaborative AI brainstorming platform. Built with Hono, Zod, and OpenAPI.',
    license: { name: 'Proprietary' },
    title: 'Roundtable API',
    version: APP_VERSION,
  },
  openapi: '3.0.0',
  security: [{ ApiKeyAuth: [] }],
  servers: [
    {
      description: 'Current environment',
      url: `${new URL(c.req.url).origin}/api/v1`,
    },
  ],
  tags: [
    { description: 'System health and diagnostics', name: 'system' },
    { description: 'Authentication and authorization', name: 'auth' },
    { description: 'API key management and authentication', name: 'api-keys' },
    { description: 'Stripe billing, subscriptions, and payments', name: 'billing' },
    { description: 'Multi-model AI chat threads and messages', name: 'chat' },
    { description: 'File uploads for chat attachments (R2 storage)', name: 'Uploads' },
    { description: 'Multipart uploads for large files', name: 'Multipart' },
    { description: 'Project-based knowledge base management with AutoRAG', name: 'projects' },
    { description: 'Knowledge file upload and management', name: 'knowledge-base' },
    { description: 'Usage tracking and quota management', name: 'usage' },
    { description: 'Dynamic OpenRouter AI models discovery and management', name: 'models' },
    { description: 'Model Context Protocol server implementation', name: 'mcp' },
    { description: 'MCP tool execution endpoints', name: 'tools' },
  ],
}));

app.get('/openapi.json', async (c) => {
  return c.redirect('/api/v1/doc');
});

// Scalar UI with CSP
app.use('/scalar', async (c, next) => {
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
    headers: newHeaders,
    status: response.status,
    statusText: response.statusText,
  });
});

// Scalar API docs - loaded from CDN, not bundled
app.get('/scalar', (c) => {
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
app.get('/llms.txt', async (c) => {
  try {
    const document = app.getOpenAPI31Document({
      info: { title: 'Application API', version: APP_VERSION },
      openapi: '3.1.0',
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
    allowedOrigins: getAllowedOriginsFromContext(c),
    betterAuthUrl,
    isProductionMode: nodeEnv === 'production',
    nodeEnv,
    timestamp: new Date().toISOString(),
    webappEnv,
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
    domain: isProduction ? '.roundtable.now' : 'none',
    isProduction,
    message: 'Cookie set',
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
    return new Response(null, { headers, status: 204 });
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
          body: body.slice(0, 1000),
          log_type: 'better_auth_error',
          path: c.req.path,
          status: response.status,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // Ignore clone errors
      }
    }

    return new Response(response.body, {
      headers: newHeaders,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    console.error({
      error_message: error instanceof Error ? error.message : String(error),
      error_name: error instanceof Error ? error.name : 'Unknown',
      error_stack: error instanceof Error ? error.stack : undefined,
      log_type: 'better_auth_exception',
      path: c.req.path,
      timestamp: new Date().toISOString(),
    });

    const headers = new Headers();
    if (origin && allowedOrigins.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Allow-Credentials', 'true');
    }
    headers.set('Content-Type', 'application/json');

    return new Response(
      JSON.stringify({ error: 'Authentication service error' }),
      { headers, status: 500 },
    );
  }
});

// Early health check - bypasses ALL middleware for fast cold starts
rootApp.get('/api/v1/health', (c) => {
  c.header('Cache-Control', 'public, max-age=5');
  return c.json({ status: 'healthy', timestamp: Date.now() });
});

// Mount API routes
rootApp.route('/api/v1', app);

// ============================================================================
// Step 9: Export for Cloudflare Workers
// ============================================================================

export default rootApp;
