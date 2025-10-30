'use client';

import type { ComponentProps } from 'react';
import { Streamdown } from 'streamdown';

import { useVirtualizedContent } from '@/hooks/utils/useVirtualizedContent';
import { cn } from '@/lib/ui/cn';

type VirtualizedResponseProps = Omit<ComponentProps<typeof Streamdown>, 'children'> & {
  /**
   * Content to render
   */
  children: string;

  /**
   * Minimum length to trigger virtualization
   * Default: 1000 characters (aggressive)
   */
  virtualizationThreshold?: number;

  /**
   * Chunk size for virtualized content
   * Default: 800 characters (aggressive)
   */
  chunkSize?: number;

  /**
   * Whether to enable virtualization
   * Default: true
   */
  enableVirtualization?: boolean;
};

/**
 * VirtualizedResponse - Response component with content virtualization
 *
 * Renders markdown text with automatic chunking for long content.
 * For content below threshold, renders normally.
 * For long content, splits into chunks for better performance.
 *
 * PERFORMANCE BENEFITS:
 * - Reduces initial render time for long responses
 * - Splits huge responses into manageable chunks
 * - Maintains smooth scrolling and streaming
 * - Splits at natural boundaries (newlines, spaces)
 *
 * @example
 * ```tsx
 * <VirtualizedResponse
 *   virtualizationThreshold={5000}
 *   chunkSize={2000}
 * >
 *   {longMarkdownText}
 * </VirtualizedResponse>
 * ```
 */
export function VirtualizedResponse({
  className,
  children,
  virtualizationThreshold = 1000,
  chunkSize = 800,
  enableVirtualization = true,
  ...props
}: VirtualizedResponseProps) {
  const content = typeof children === 'string' ? children : '';

  const { isVirtualized, chunks } = useVirtualizedContent({
    content,
    threshold: virtualizationThreshold,
    chunkSize,
    enabled: enableVirtualization,
  });

  const baseClassName = cn(
    'size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
    className,
  );

  // Render full content if not virtualized
  if (!isVirtualized) {
    return (
      <Streamdown
        className={baseClassName}
        {...props}
      >
        {content}
      </Streamdown>
    );
  }

  // Render chunked content
  return (
    <div className={baseClassName}>
      {chunks.map((chunk, index) => (
        <Streamdown
          key={chunk.key}
          className={cn(
            '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
            // Add spacing between chunks except first
            index > 0 && 'mt-0',
          )}
          {...props}
        >
          {chunk.content}
        </Streamdown>
      ))}
    </div>
  );
}
