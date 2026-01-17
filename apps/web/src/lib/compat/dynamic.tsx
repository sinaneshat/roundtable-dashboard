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

/**
 * Dynamic import with Suspense
 *
 * @example
 * const DynamicComponent = dynamic(() => import('./MyComponent'));
 *
 * @example
 * const DynamicComponent = dynamic(() => import('./MyComponent'), {
 *   loading: () => <p>Loading...</p>,
 * });
 */
export default function dynamic<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  options: DynamicOptions = {},
): ComponentType<P> {
  const LazyComponent = lazy(importFn);

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
