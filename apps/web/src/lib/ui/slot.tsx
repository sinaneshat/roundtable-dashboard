import type { HTMLAttributes, ReactElement, ReactNode, Ref } from 'react';
import { Children, cloneElement, isValidElement } from 'react';

import { cn } from '@/lib/ui/cn';

type SlotProps = {
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>;

type MergedProps = Record<string, unknown> & {
  className?: string;
  ref?: Ref<unknown>;
};

type ElementProps = Record<string, unknown>;

function isSlottableChild(child: ReactNode): child is ReactElement {
  return isValidElement(child);
}

function isStringOrUndefined(value: unknown): value is string | undefined {
  return typeof value === 'string' || value === undefined;
}

function isElementProps(props: unknown): props is ElementProps {
  return typeof props === 'object' && props !== null;
}

function hasClassNameProp(props: ElementProps): props is ElementProps & { className?: unknown } {
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
