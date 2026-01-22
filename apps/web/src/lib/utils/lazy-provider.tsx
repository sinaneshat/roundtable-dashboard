import type { ComponentType, ReactNode } from 'react';
import { useEffect, useState } from 'react';

type LazyProviderProps<T extends Record<string, unknown>> = {
  children: ReactNode;
  loader: () => Promise<{ default: ComponentType<T> } | ComponentType<T>>;
  fallback?: ReactNode;
  providerProps: T;
};

/**
 * Lazy Provider Wrapper - Performance Optimization
 *
 * Defers loading of non-critical providers until after initial render.
 * This reduces the initial bundle size and improves Time to Interactive.
 *
 * Usage:
 * ```tsx
 * <LazyProvider
 *   loader={() => import('./PostHogProvider').then(m => ({ default: m.default }))}
 *   providerProps={{ apiKey, environment }}
 * >
 *   {children}
 * </LazyProvider>
 * ```
 *
 * Features:
 * - Loads provider after initial render via useEffect
 * - Children render immediately (provider wraps after load)
 * - Supports fallback UI during provider load
 * - Type-safe provider props
 * - Works with default and named exports
 */
export function LazyProvider<T extends Record<string, unknown>>({
  children,
  loader,
  fallback,
  providerProps,
}: LazyProviderProps<T>) {
  const [Provider, setProvider] = useState<ComponentType<T> | null>(null);

  useEffect(() => {
    let cancelled = false;

    loader().then((module) => {
      if (cancelled)
        return;
      // Handle both default exports and direct component exports
      const component = 'default' in module ? module.default : module;
      setProvider(() => component);
    }).catch((error) => {
      if (cancelled)
        return;
      console.error('[LazyProvider] Failed to load provider:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [loader]);

  // Render children immediately - provider wraps after load
  if (!Provider) {
    return <>{fallback ?? children}</>;
  }

  return <Provider {...providerProps}>{children}</Provider>;
}

/**
 * Schedule a callback to run when the browser is idle.
 * Falls back to setTimeout if requestIdleCallback is not available.
 */
function scheduleWhenIdle(callback: () => void, timeout = 2000): void {
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(callback, { timeout });
  } else {
    setTimeout(callback, 50);
  }
}

/**
 * Idle Lazy Provider - Defers loading until browser is idle
 *
 * More aggressive optimization - waits for browser idle time before loading.
 * Use for truly non-critical providers (analytics, feature flags, etc.)
 */
export function IdleLazyProvider<T extends Record<string, unknown>>({
  children,
  loader,
  fallback,
  providerProps,
  timeout = 2000,
}: LazyProviderProps<T> & { timeout?: number }) {
  const [Provider, setProvider] = useState<ComponentType<T> | null>(null);

  useEffect(() => {
    let cancelled = false;

    scheduleWhenIdle(() => {
      loader().then((module) => {
        if (cancelled)
          return;
        const component = 'default' in module ? module.default : module;
        setProvider(() => component);
      }).catch((error) => {
        if (cancelled)
          return;
        console.error('[IdleLazyProvider] Failed to load provider:', error);
      });
    }, timeout);

    return () => {
      cancelled = true;
    };
  }, [loader, timeout]);

  if (!Provider) {
    return <>{fallback ?? children}</>;
  }

  return <Provider {...providerProps}>{children}</Provider>;
}
