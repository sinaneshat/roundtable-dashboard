import { useMemo } from 'react';

export type UseVirtualizedContentOptions = {
  /**
   * Content string to virtualize
   */
  content: string;

  /**
   * Minimum content length to trigger virtualization
   * Below this length, returns full content without virtualization
   * Default: 1000 characters (aggressive)
   */
  threshold?: number;

  /**
   * Size of each content chunk in characters
   * Default: 800 characters (aggressive)
   */
  chunkSize?: number;

  /**
   * Whether virtualization is enabled
   * Default: true
   */
  enabled?: boolean;
};

export type ContentChunk = {
  /**
   * Unique key for this chunk
   */
  key: string;

  /**
   * Chunk index
   */
  index: number;

  /**
   * Chunk text content
   */
  content: string;

  /**
   * Start position in original string
   */
  start: number;

  /**
   * End position in original string
   */
  end: number;
};

export type UseVirtualizedContentResult = {
  /**
   * Whether content is virtualized
   */
  isVirtualized: boolean;

  /**
   * Original content length
   */
  contentLength: number;

  /**
   * Content chunks (if virtualized)
   */
  chunks: ContentChunk[];

  /**
   * Full content (if not virtualized)
   */
  content: string;
};

/**
 * useVirtualizedContent - Split long content into virtualizable chunks
 *
 * For very long text content (e.g., long AI responses), splits into chunks
 * that can be rendered incrementally or virtualized.
 *
 * KEY FEATURES:
 * - Only activates for content above threshold
 * - Splits at natural boundaries (newlines, spaces)
 * - Returns full content if below threshold
 * - Configurable chunk size and threshold
 *
 * PERFORMANCE BENEFITS:
 * - Reduces initial render cost for long content
 * - Enables progressive rendering
 * - Can be combined with virtualization for huge content
 *
 * @example
 * ```tsx
 * const { isVirtualized, chunks, content } = useVirtualizedContent({
 *   content: messageText,
 *   threshold: 5000,
 *   chunkSize: 2000,
 * });
 *
 * if (!isVirtualized) {
 *   return <Markdown>{content}</Markdown>;
 * }
 *
 * return (
 *   <>
 *     {chunks.map((chunk) => (
 *       <Markdown key={chunk.key}>{chunk.content}</Markdown>
 *     ))}
 *   </>
 * );
 * ```
 */
export function useVirtualizedContent({
  content,
  threshold = 1000,
  chunkSize = 800,
  enabled = true,
}: UseVirtualizedContentOptions): UseVirtualizedContentResult {
  const result = useMemo(() => {
    // Return full content if disabled or below threshold
    if (!enabled || content.length < threshold) {
      return {
        isVirtualized: false,
        contentLength: content.length,
        chunks: [],
        content,
      };
    }

    // Split content into chunks
    const chunks: ContentChunk[] = [];
    let currentPos = 0;
    let chunkIndex = 0;

    while (currentPos < content.length) {
      const remainingLength = content.length - currentPos;
      let endPos = Math.min(currentPos + chunkSize, content.length);

      // If not at end of content, try to split at natural boundary
      if (endPos < content.length && remainingLength > chunkSize) {
        // Look for newline within next 200 chars
        const searchEnd = Math.min(endPos + 200, content.length);
        const newlinePos = content.indexOf('\n', endPos);
        if (newlinePos !== -1 && newlinePos < searchEnd) {
          endPos = newlinePos + 1; // Include newline
        } else {
          // Look for space within next 100 chars
          const spaceSearchEnd = Math.min(endPos + 100, content.length);
          const spacePos = content.lastIndexOf(' ', spaceSearchEnd);
          if (spacePos > endPos) {
            endPos = spacePos + 1; // Include space
          }
        }
      }

      const chunkContent = content.slice(currentPos, endPos);
      chunks.push({
        key: `chunk-${chunkIndex}`,
        index: chunkIndex,
        content: chunkContent,
        start: currentPos,
        end: endPos,
      });

      currentPos = endPos;
      chunkIndex++;
    }

    return {
      isVirtualized: true,
      contentLength: content.length,
      chunks,
      content: '', // Not used when virtualized
    };
  }, [content, threshold, chunkSize, enabled]);

  return result;
}
