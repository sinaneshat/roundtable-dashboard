import type { ComponentProps } from 'react';

import * as VisuallyHiddenPrimitive from "@radix-ui/react-visually-hidden"

function VisuallyHidden({
  ...props
}: ComponentProps<typeof VisuallyHiddenPrimitive.Root>) {
  return <VisuallyHiddenPrimitive.Root {...props} />
}

export { VisuallyHidden }
