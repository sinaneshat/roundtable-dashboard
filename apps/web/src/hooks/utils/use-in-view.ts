import { useEffect, useRef, useState } from 'react';

type UseInViewOptions = {
  /** Root element for intersection (default: viewport) */
  root?: Element | null;
  /** Margin around root (default: '0px') */
  rootMargin?: string;
  /** Visibility threshold 0-1 (default: 0) */
  threshold?: number | number[];
  /** Once visible, stay visible (default: true for prefetch optimization) */
  once?: boolean;
  /** Initial state before observer fires */
  initialValue?: boolean;
};

type UseInViewReturn<T extends Element> = {
  ref: React.RefObject<T | null>;
  isInView: boolean;
};

/**
 * Tracks element visibility in viewport using IntersectionObserver.
 * Optimized for prefetch - once visible, stays visible by default (once: true).
 */
export function useInView<T extends Element = Element>(
  options: UseInViewOptions = {},
): UseInViewReturn<T> {
  const {
    root = null,
    rootMargin = '0px',
    threshold = 0,
    once = true,
    initialValue = false,
  } = options;

  const ref = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(initialValue);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    // Already visible and once mode - no need to observe
    if (isInView && once) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          const visible = entry.isIntersecting;
          setIsInView(visible);

          // Disconnect after first visibility if once mode
          if (visible && once) {
            observer.disconnect();
          }
        }
      },
      { root, rootMargin, threshold },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [root, rootMargin, threshold, once, isInView]);

  return { ref, isInView };
}
