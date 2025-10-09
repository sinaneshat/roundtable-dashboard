'use client';

import type { ComponentProps } from 'react';
import { Streamdown } from 'streamdown';

import { cn } from '@/lib/ui/cn';

type ResponseProps = ComponentProps<typeof Streamdown>;

/**
 * ✅ OFFICIAL AI SDK PATTERN: Response component for rendering markdown text
 * NO memo optimization - allows React to re-render during streaming
 * See: https://ai-sdk.dev/elements/components/response
 */
export function Response({ className, ...props }: ResponseProps) {
  return (
    <Streamdown
      className={cn(
        'size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        className,
      )}
      {...props}
    />
  );
}
