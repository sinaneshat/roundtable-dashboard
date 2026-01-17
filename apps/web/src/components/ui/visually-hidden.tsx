import * as VisuallyHiddenPrimitive from '@radix-ui/react-visually-hidden';
import type { ComponentProps } from 'react';

function VisuallyHidden({
  ...props
}: ComponentProps<typeof VisuallyHiddenPrimitive.Root>) {
  return <VisuallyHiddenPrimitive.Root {...props} />;
}

export { VisuallyHidden };
