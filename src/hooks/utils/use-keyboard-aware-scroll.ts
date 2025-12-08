import { useEffect, useEffectEvent, useRef } from 'react';

/**
 * Simplified keyboard-aware scroll hook following mobile web best practices
 *
 * On mobile, the browser automatically resizes the viewport when the keyboard opens.
 * We just need to scroll the focused input into view - no complex device detection needed.
 *
 * ✅ REACT 19: Uses useEffectEvent for focus handler to avoid re-subscribing
 *
 * @param inputRef - Ref to the input/textarea element
 * @param options - Configuration options
 * @param options.enabled - Whether the scroll behavior is enabled (default: true)
 */
export function useKeyboardAwareScroll<T extends HTMLElement>(
  inputRef: React.RefObject<T | null>,
  options: {
    enabled?: boolean;
  } = {},
) {
  const { enabled = true } = options;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ✅ REACT 19: useEffectEvent for focus handler - reads inputRef.current without dep
  const onFocus = useEffectEvent(() => {
    const input = inputRef.current;
    if (!input)
      return;

    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Wait for mobile keyboard to animate open (~300ms) before scrolling
    // NOTE: setTimeout is intentional here - we need to wait for keyboard animation
    timeoutRef.current = setTimeout(() => {
      input.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }, 300);
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined')
      return;

    const input = inputRef.current;
    if (!input)
      return;

    const handleFocus = () => {
      onFocus();
    };

    input.addEventListener('focus', handleFocus);

    return () => {
      input.removeEventListener('focus', handleFocus);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- inputRef accessed via useEffectEvent (React 19 pattern)
  }, [enabled]);
}
