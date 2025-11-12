'use client';

import { useCallback, useEffect } from 'react';

export type UseAutoResizeTextareaOptions = {
  minHeight?: number;
  maxHeight?: number;
  value?: string;
};

export function useAutoResizeTextarea(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  options: UseAutoResizeTextareaOptions = {},
) {
  const {
    minHeight = 80,
    maxHeight = 240,
    value,
  } = options;

  const resize = useCallback(() => {
    const textarea = ref.current;
    if (!textarea)
      return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';

    // Calculate new height
    const scrollHeight = textarea.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);

    // Set new height
    textarea.style.height = `${newHeight}px`;

    // Enable/disable scrolling based on whether we hit max height
    if (scrollHeight > maxHeight) {
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.overflowY = 'hidden';
    }
  }, [ref, minHeight, maxHeight]);

  // Resize on mount and value change (merged from duplicate useEffect)
  useEffect(() => {
    resize();
  }, [value, resize]);

  return { resize };
}
