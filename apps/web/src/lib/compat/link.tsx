/**
 * Link Component
 *
 * TanStack Router Link with prefetch and scroll control.
 */

import { Link as TanStackLink } from '@tanstack/react-router';
import type { ComponentProps, ReactNode } from 'react';

type LinkProps = {
  href: string;
  children: ReactNode;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
} & Omit<ComponentProps<'a'>, 'href'>;

/**
 * Link component with prefetch on intent
 */
export default function Link({
  href,
  children,
  prefetch = true,
  replace = false,
  scroll = true,
  ...props
}: LinkProps) {
  return (
    <TanStackLink
      to={href}
      preload={prefetch ? 'intent' : false}
      replace={replace}
      resetScroll={scroll}
      {...props}
    >
      {children}
    </TanStackLink>
  );
}

/**
 * Link loading status hook (stub - always returns { pending: false })
 */
export function useLinkStatus() {
  // TanStack Router doesn't have a direct equivalent
  // Return a default status
  return { pending: false };
}
