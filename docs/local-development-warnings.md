# Local Development Warnings - Expected Behavior

This document explains warnings that appear during development and deployment. These are **informational only** and do not affect functionality.

---

## ⚠️ Durable Object Warnings (EXPECTED & NORMAL)

When running `npm run dev`, you will see warnings about Durable Objects not being exported. **This is completely normal and expected behavior.**

### Example Warning Messages

```
▲ [WARNING] You have defined bindings to the following internal Durable Objects:
  - {"name":"NEXT_CACHE_DO_QUEUE","class_name":"DOQueueHandler"}
  - {"name":"NEXT_CACHE_DO_PURGE","class_name":"BucketCachePurge"}
  These will not work in local development, but they should work in production.
```

```
workerd/server/server.c++:1885: warning: A DurableObjectNamespace in the config referenced the class "DOQueueHandler", but no such Durable Object class is exported from the worker.
```

### Why This Happens

**Durable Objects are only available at build time**, not during local development with `next dev`:

1. **Next.js Dev Mode**: Runs your app in Node.js with hot reload
2. **Durable Objects**: Are Cloudflare Workers runtime features that only exist when the worker is built and deployed
3. **OpenNext Build Process**: Injects the Durable Object classes (`DOQueueHandler`, `BucketCachePurge`) during the build step

### What This Means

| Environment | Durable Objects Available? | ISR Features Available? |
|-------------|---------------------------|------------------------|
| **`npm run dev`** (Next.js dev) | ❌ No | ⚠️ Limited (local simulation) |
| **`npm run preview`** (Wrangler dev) | ✅ Yes (simulated) | ✅ Yes (local bindings) |
| **Production Deployment** | ✅ Yes (real) | ✅ Yes (full functionality) |

### Impact on Development

**During `npm run dev`:**
- ✅ App works normally
- ✅ All routes render correctly
- ✅ API endpoints function
- ✅ Authentication works
- ✅ Database queries work
- ⚠️ ISR revalidation will use Next.js's default behavior (not Cloudflare's queue system)
- ⚠️ Cloudflare-specific caching features are not active

**The warnings DO NOT affect your app's functionality during development.**

### Testing ISR Features Locally

To test ISR features with actual Durable Objects locally:

```bash
# Build and run in Wrangler dev mode (simulates Workers runtime)
npm run preview
```

This will:
- ✅ Build your worker with OpenNext
- ✅ Simulate Durable Objects locally
- ✅ Use local bindings for R2, D1, KV
- ✅ Test ISR revalidation queue
- ✅ Test cache purge functionality

### Full ISR Testing (Production-like)

```bash
# Deploy to preview environment
npm run deploy:preview

# Visit: https://app-preview.roundtable.now
```

## 🔧 Summary

**These warnings are informational only and can be safely ignored during local development.**

- **Use `npm run dev`** for fast development with hot reload
- **Use `npm run preview`** when you need to test Cloudflare-specific features
- **Deploy to preview** for full production-like testing

The warnings remind you that Cloudflare Workers features (like Durable Objects) are not available in standard Next.js dev mode, but they will work correctly when deployed.

---

## ⚠️ CORS Duplicate Key Warnings (EXPECTED - LIBRARY BEHAVIOR)

During build/deploy, esbuild reports duplicate key warnings from Hono's CORS middleware:

### Example Warning Messages

```
▲ [WARNING] Duplicate key "origin" in object literal [duplicate-object-key]
▲ [WARNING] Duplicate key "allowMethods" in object literal [duplicate-object-key]
▲ [WARNING] Duplicate key "allowHeaders" in object literal [duplicate-object-key]
```

### Why This Happens

Hono's `cors()` middleware internally merges default options with user options using object spread:

```javascript
// Internal Hono implementation (simplified)
const config = { ...defaults, ...userOptions };
// Results in: { origin: "*", allowMethods: [...], origin: (fn) => ... }
```

When esbuild bundles this, it sees duplicate keys in the resulting object literal.

### Impact

**None.** JavaScript uses the last value when duplicate keys exist, so your custom CORS configuration takes precedence. The warnings are cosmetic only.

### Source

- `node_modules/hono/dist/middleware/cors/` (library code)
- Cannot be fixed without patching Hono

---

## ⚠️ Floating UI Duplicate Options Warnings (EXPECTED - LIBRARY BEHAVIOR)

During build/deploy, esbuild reports duplicate `options` key warnings from Floating UI:

### Example Warning Messages

```
▲ [WARNING] Duplicate key "options" in object literal [duplicate-object-key]
    .open-next/server-functions/default/handler.mjs:2946:63982
```

### Why This Happens

The `@floating-ui/dom` library (used by Radix UI/shadcn components) has internal middleware configuration that creates objects with duplicate `options` keys when bundled.

### Impact

**None.** Same JavaScript duplicate key behavior - last value wins. The library functions correctly.

### Source

- `node_modules/@floating-ui/*` (library code)
- Used by Radix UI primitives (Popover, Tooltip, Dropdown, etc.)
- Cannot be fixed without patching the library

---

## 📚 Related Documentation

- [Cloudflare ISR Setup Guide](/docs/cloudflare-isr-setup.md)
- [OpenNext Cloudflare Documentation](https://opennext.js.org/cloudflare)
- [Durable Objects Documentation](https://developers.cloudflare.com/durable-objects/)
