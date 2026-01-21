import type { RefObject } from 'react';
import { useLayoutEffect, useRef } from 'react';

/**
 * Captures any text typed in textarea during SSR/hydration phase
 * and syncs it to callback after mount.
 *
 * During SSR, the textarea is rendered but React hasn't hydrated yet.
 * Users can type into the textarea, but that value lives only in the DOM.
 * After hydration, React takes over with the store's value (usually empty).
 * This hook captures the pre-hydration DOM value and syncs it to the store.
 */
export function useHydrationInputCapture(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  onCapture: (value: string) => void,
  currentValue: string,
): void {
  const hasCapturedRef = useRef(false);

  useLayoutEffect(() => {
    if (hasCapturedRef.current)
      return;

    const textarea = textareaRef.current;
    if (!textarea)
      return;

    // Read DOM value - catches text typed during SSR
    const domValue = textarea.value;

    // Only capture if DOM has value and store is empty
    if (domValue && domValue.trim() && (!currentValue || !currentValue.trim())) {
      hasCapturedRef.current = true;
      onCapture(domValue);
    }
  }, [textareaRef, onCapture, currentValue]);
}
