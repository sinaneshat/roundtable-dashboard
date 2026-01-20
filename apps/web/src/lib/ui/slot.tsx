import type { HTMLAttributes, ReactElement, ReactNode, Ref } from 'react';
import { Children, cloneElement, isValidElement } from 'react';

import { cn } from '@/lib/ui/cn';

type SlotProps = {
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>;

// MergedProps must accept any valid React props since we're merging props from
// an unknown child element. This includes HTML attributes, data attributes,
// aria attributes, event handlers, and custom component props.
type MergedProps = {
  [key: string]: unknown;
  className?: string;
  ref?: Ref<unknown>;
};

// ElementProps represents React element props which can contain any valid
// HTML/React attribute. We cannot be more specific here without losing
// the ability to merge props from arbitrary components.
type ElementProps = {
  [key: string]: unknown;
};

function isSlottableChild(child: ReactNode): child is ReactElement {
  return isValidElement(child);
}

function isStringOrUndefined(value: unknown): value is string | undefined {
  return typeof value === 'string' || value === undefined;
}

function isElementProps(props: unknown): props is ElementProps {
  return typeof props === 'object' && props !== null;
}

function hasClassNameProp(props: ElementProps): props is ElementProps & { className?: string } {
  return 'className' in props;
}

function Slot({ ref, children, ...props }: SlotProps & { ref?: Ref<HTMLElement> | null }) {
  // eslint-disable-next-line react/no-children-to-array -- Required for React 19 + Radix compatibility
  const childArray = Children.toArray(children);
  const slottableChild = childArray.find(isSlottableChild);

  if (slottableChild) {
    const childPropsRaw = slottableChild.props;

    if (!isElementProps(childPropsRaw))
      return null;

    const childProps = childPropsRaw;

    const childClassName = hasClassNameProp(childProps) && isStringOrUndefined(childProps.className)
      ? childProps.className
      : undefined;

    const mergedClassName = cn(props.className, childClassName);

    const mergedProps: MergedProps = { ...props };

    for (const key of Object.keys(childProps)) {
      if (key === 'className' || key === 'ref')
        continue;
      if (!(key in mergedProps)) {
        mergedProps[key] = childProps[key];
      }
    }

    mergedProps.className = mergedClassName || undefined;
    mergedProps.ref = ref ?? undefined;

    // eslint-disable-next-line react/no-clone-element -- Required for React 19 + Radix compatibility
    return cloneElement(slottableChild, mergedProps);
  }

  if (isSlottableChild(children))
    return children;

  return null;
}

Slot.displayName = 'Slot';

export { Slot, type SlotProps };
