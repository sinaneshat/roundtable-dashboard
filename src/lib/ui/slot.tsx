'use client';

import type { HTMLAttributes, ReactElement, ReactNode, Ref } from 'react';
import { Children, cloneElement, isValidElement } from 'react';

import { cn } from '@/lib/ui/cn';

// Custom Slot implementation to avoid React 19 + Radix useComposedRefs infinite loop
// See: https://github.com/radix-ui/primitives/issues/3675

type SlotProps = {
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>;

function isSlottableChild(child: ReactNode): child is ReactElement {
  return isValidElement(child);
}

function Slot({ ref, children, ...props }: SlotProps & { ref?: Ref<HTMLElement> | null }) {
  const childArray = Children.toArray(children);
  const slottableChild = childArray.find(isSlottableChild);

  if (slottableChild) {
    // Clone the child element and merge props
    const childProps = slottableChild.props as Record<string, unknown>;
    const childClassName = childProps.className as string | undefined;
    const mergedClassName = cn(props.className, childClassName);

    // Merge event handlers and other props
    const mergedProps: Record<string, unknown> = { ...props };

    // Copy child props, but props from parent (Slot) take precedence for className
    for (const key of Object.keys(childProps)) {
      if (key === 'className')
        continue; // Already handled
      if (key === 'ref')
        continue; // Will be handled separately
      if (!(key in mergedProps)) {
        mergedProps[key] = childProps[key];
      }
    }

    mergedProps.className = mergedClassName || undefined;
    mergedProps.ref = ref as Ref<unknown>;

    return cloneElement(slottableChild, mergedProps);
  }

  // No slottable child, render children as-is
  return children as ReactElement;
}

Slot.displayName = 'Slot';

export { Slot, type SlotProps };
