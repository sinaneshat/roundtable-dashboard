import { useEffect, useRef } from 'react';

/**
 * Simplified keyboard-aware scroll hook following mobile web best practices
 *
 * On mobile, the browser automatically resizes the viewport when the keyboard opens.
 * We just need to scroll the focused input into view - no complex device detection needed.
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

  useEffect(() => {
    if (!enabled || typeof window === 'undefined')
      return;

    const input = inputRef.current;
    if (!input)
      return;

    const handleFocus = () => {
      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Simple: Just scroll into view when focused
      // Browser handles keyboard automatically on mobile
      timeoutRef.current = setTimeout(() => {
        input.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        });
      }, 300);
    };

    input.addEventListener('focus', handleFocus);

    return () => {
      input.removeEventListener('focus', handleFocus);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [enabled, inputRef]);
}
