import type { VirtualItem, Virtualizer } from '@tanstack/react-virtual';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback } from 'react';

export type UseVirtualizedMessagesOptions<T> = {
  /**
   * Array of messages/items to virtualize
   */
  items: T[];

  /**
   * Get scroll container element
   * Should return the scrollable parent container
   */
  getScrollElement: () => HTMLElement | null;

  /**
   * Estimated size per message in pixels
   * Default: 200px (covers most messages)
   */
  estimateSize?: number;

  /**
   * Number of items to render outside visible viewport
   * Default: 2
   */
  overscan?: number;

  /**
   * Whether virtualization is enabled
   * Default: true
   */
  enabled?: boolean;

  /**
   * Whether to use horizontal virtualization
   * Default: false (vertical)
   */
  horizontal?: boolean;
};

export type UseVirtualizedMessagesResult<T> = {
  /**
   * Virtualizer instance
   */
  virtualizer: Virtualizer<HTMLElement, Element>;

  /**
   * Virtual items to render
   */
  virtualItems: VirtualItem[];

  /**
   * Total size of all items (px)
   */
  totalSize: number;

  /**
   * Measure element function
   * Attach to each rendered element's ref
   */
  measureElement: (element: Element | null) => void;

  /**
   * Scroll to specific index
   */
  scrollToIndex: (
    index: number,
    options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' },
  ) => void;

  /**
   * Scroll to item matching predicate
   */
  scrollToItem: (
    predicate: (item: T, index: number) => boolean,
    options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' },
  ) => boolean;
};

/**
 * useVirtualizedMessages - Container-level virtualization for message lists
 *
 * Virtualizes messages within a scrollable container (NOT window scroll).
 * Use this for message lists inside timeline items.
 *
 * KEY FEATURES:
 * - Dynamic sizing for variable-height messages
 * - Container scroll (nested within window virtualizer)
 * - Minimal overscan for smooth scrolling
 * - Works inside virtualized timeline items
 *
 * PERFORMANCE BENEFITS:
 * - Only renders visible messages + overscan
 * - Reduces DOM for large message groups (100+ messages → ~10 visible)
 * - Maintains smooth scrolling during updates
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const { virtualItems, totalSize, measureElement } = useVirtualizedMessages({
 *   items: messages,
 *   getScrollElement: () => containerRef.current,
 *   estimateSize: 200,
 *   overscan: 2,
 * });
 *
 * return (
 *   <div ref={containerRef} style={{ height: '400px', overflow: 'auto' }}>
 *     <div style={{ height: `${totalSize}px`, position: 'relative' }}>
 *       {virtualItems.map((virtualItem) => (
 *         <div
 *           key={virtualItem.key}
 *           data-index={virtualItem.index}
 *           ref={measureElement}
 *           style={{
 *             position: 'absolute',
 *             top: 0,
 *             left: 0,
 *             width: '100%',
 *             transform: `translateY(${virtualItem.start}px)`,
 *           }}
 *         >
 *           <Message {...messages[virtualItem.index]} />
 *         </div>
 *       ))}
 *     </div>
 *   </div>
 * );
 * ```
 */
export function useVirtualizedMessages<T>({
  items,
  getScrollElement,
  estimateSize = 200,
  overscan = 2,
  enabled = true,
  horizontal = false,
}: UseVirtualizedMessagesOptions<T>): UseVirtualizedMessagesResult<T> {
  // Initialize container virtualizer
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    estimateSize: () => estimateSize,
    overscan,
    enabled,
    horizontal,
  });

  // Get virtual items
  const virtualItems = virtualizer.getVirtualItems();

  // Get total size
  const totalSize = virtualizer.getTotalSize();

  // Measure element function
  const measureElement = virtualizer.measureElement;

  // Scroll to specific index
  const scrollToIndex = useCallback(
    (
      index: number,
      options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' },
    ) => {
      virtualizer.scrollToIndex(index, options);
    },
    [virtualizer],
  );

  // Scroll to item matching predicate
  const scrollToItem = useCallback(
    (
      predicate: (item: T, index: number) => boolean,
      options?: { align?: 'start' | 'center' | 'end' | 'auto'; behavior?: 'auto' | 'smooth' },
    ): boolean => {
      const targetIndex = items.findIndex(predicate);
      if (targetIndex === -1) {
        return false;
      }
      scrollToIndex(targetIndex, options);
      return true;
    },
    [items, scrollToIndex],
  );

  return {
    virtualizer,
    virtualItems,
    totalSize,
    measureElement,
    scrollToIndex,
    scrollToItem,
  };
}
