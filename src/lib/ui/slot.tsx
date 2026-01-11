'use client';

import type { HTMLAttributes, ReactElement, ReactNode, Ref } from 'react';
import { Children, cloneElement, isValidElement } from 'react';

import { cn } from '@/lib/ui/cn';

// Custom Slot for React 19 + Radix compatibility (avoids useComposedRefs issues)

type SlotProps = {
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>;

function isSlottableChild(child: ReactNode): child is ReactElement {
  return isValidElement(child);
}

function Slot({ ref, children, ...props }: SlotProps & { ref?: Ref<HTMLElement> | null }) {
  // eslint-disable-next-line react/no-children-to-array -- Required for React 19 + Radix compatibility
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

    // eslint-disable-next-line react/no-clone-element -- Required for React 19 + Radix compatibility
    return cloneElement(slottableChild, mergedProps);
  }

  // No slottable child, render children as-is
  return children as ReactElement;
}

Slot.displayName = 'Slot';

export { Slot, type SlotProps };
