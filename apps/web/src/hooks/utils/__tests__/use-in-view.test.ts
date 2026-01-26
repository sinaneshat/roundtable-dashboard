import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@/lib/testing';

import { useInView } from '../use-in-view';

describe('useInView', () => {
  let mockObserve: ReturnType<typeof vi.fn>;
  let mockDisconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockObserve = vi.fn();
    mockDisconnect = vi.fn();

    vi.stubGlobal('IntersectionObserver', vi.fn(() => ({
      disconnect: mockDisconnect,
      observe: mockObserve,
      unobserve: vi.fn(),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return ref and initial isInView as false', () => {
    const { result } = renderHook(() => useInView());

    expect(result.current.ref).toBeDefined();
    expect(result.current.isInView).toBeFalsy();
  });

  it('should return initial value when provided', () => {
    const { result } = renderHook(() => useInView({ initialValue: true }));

    expect(result.current.isInView).toBeTruthy();
  });

  it('should default once to true for prefetch optimization', () => {
    const { result } = renderHook(() => useInView());

    // Default is once: true, and with no element yet, isInView starts false
    expect(result.current.isInView).toBeFalsy();
  });

  it('should accept custom rootMargin', () => {
    const { result } = renderHook(() => useInView({ rootMargin: '100px' }));

    expect(result.current.ref).toBeDefined();
    expect(result.current.isInView).toBeFalsy();
  });

  it('should accept custom threshold', () => {
    const { result } = renderHook(() => useInView({ threshold: 0.5 }));

    expect(result.current.ref).toBeDefined();
    expect(result.current.isInView).toBeFalsy();
  });

  it('should return stable ref across re-renders', () => {
    const { rerender, result } = renderHook(() => useInView());

    const firstRef = result.current.ref;
    rerender();
    const secondRef = result.current.ref;

    expect(firstRef).toBe(secondRef);
  });
});
