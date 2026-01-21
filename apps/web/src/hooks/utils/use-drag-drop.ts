/**
 * Drag and Drop Hook
 *
 * Manages drag and drop state for file drop zones.
 * Used by chat input to handle file uploads via drag and drop.
 */

import type React from 'react';
import { useCallback, useRef, useState } from 'react';

/**
 * Return type for useDragDrop hook
 */
export type UseDragDropReturn = {
  /** Whether user is currently dragging files over the drop zone */
  isDragging: boolean;
  /** Event handlers to attach to the drop zone element */
  dragHandlers: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
};

/**
 * Hook to manage drag and drop state for file uploads
 *
 * @param onFilesDropped - Callback when files are dropped
 * @returns Drag state and event handlers
 *
 * @example
 * ```tsx
 * const { isDragging, dragHandlers } = useDragDrop((files) => {
 * });
 *
 * return (
 *   <div {...dragHandlers}>
 *     {isDragging ? 'Drop files here' : 'Drag files here'}
 *   </div>
 * );
 * ```
 */
export function useDragDrop(
  onFilesDropped: (files: File[]) => void,
): UseDragDropReturn {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;

    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;

    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFilesDropped(files);
    }
  }, [onFilesDropped]);

  return {
    isDragging,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  };
}
