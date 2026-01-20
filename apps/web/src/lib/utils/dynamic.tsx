/**
 * Dynamic Import Utility
 *
 * React.lazy wrapper with Suspense for code-splitting components.
 * Supports SSR opt-out for client-only components.
 */

'use client';

import type { ComponentType, ReactNode } from 'react';
import { lazy, Suspense, useSyncExternalStore } from 'react';

type DynamicOptions = {
  loading?: () => ReactNode;
  ssr?: boolean;
};

type DefaultExportModule<P> = { default: ComponentType<P> };

/**
 * Dynamic import with Suspense
 *
 * @example
 * // Default export
 * const DynamicComponent = dynamic(() => import('./MyComponent'));
 *
 * @example
 * // Named export (use type parameter for correct inference)
 * const DynamicComponent = dynamic<ComponentProps>(
 *   () => import('./MyComponent').then(m => ({ default: m.NamedComponent }))
 * );
 *
 * @example
 * // With loading state and SSR disabled
 * const DynamicComponent = dynamic(() => import('./MyComponent'), {
 *   loading: () => <Skeleton />,
 *   ssr: false, // Only load on client
 * });
 */
export default function dynamic<P extends object>(
  importFn: () => Promise<DefaultExportModule<P>>,
  options: DynamicOptions = {},
): ComponentType<P> {
  // Use type assertion in lazy() to handle union types from .then() transformations
  const LazyComponent = lazy(() => importFn() as Promise<DefaultExportModule<P>>);

  // Client-side state subscription for useSyncExternalStore
  const subscribe = () => {
    // No-op: we only need to track mount state, not listen for changes
    return () => {};
  };

  const getClientSnapshot = () => true;
  const getServerSnapshot = () => false;

  const DynamicComponent = (props: P) => {
    const fallback = options.loading?.() ?? null;
    const isClient = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

    // When ssr: false, show fallback during SSR and until client hydrates
    if (options.ssr === false && !isClient) {
      return <>{fallback}</>;
    }

    return (
      <Suspense fallback={fallback}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };

  DynamicComponent.displayName = 'DynamicComponent';

  return DynamicComponent;
}
