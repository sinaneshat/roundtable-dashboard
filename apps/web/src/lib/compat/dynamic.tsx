/**
 * Dynamic Import Utility
 *
 * React.lazy wrapper with Suspense for code-splitting components.
 */

import type { ComponentType, ReactNode } from 'react';
import { lazy, Suspense } from 'react';

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
 * // With loading state
 * const DynamicComponent = dynamic(() => import('./MyComponent'), {
 *   loading: () => <p>Loading...</p>,
 * });
 */
export default function dynamic<P extends object>(
  importFn: () => Promise<DefaultExportModule<P>>,
  options: DynamicOptions = {},
): ComponentType<P> {
  // Use type assertion in lazy() to handle union types from .then() transformations
  const LazyComponent = lazy(() => importFn() as Promise<DefaultExportModule<P>>);

  const DynamicComponent = (props: P) => {
    const fallback = options.loading?.() ?? null;

    return (
      <Suspense fallback={fallback}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };

  DynamicComponent.displayName = 'DynamicComponent';

  return DynamicComponent;
}
