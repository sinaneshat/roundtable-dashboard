'use client';

import { useState } from 'react';

/**
 * Hook to detect if the device supports touch input
 *
 * Checks for:
 * 1. 'ontouchstart' in window (standard touch detection)
 * 2. navigator.maxTouchPoints > 0 (modern touch capability detection)
 *
 * Used for mobile-specific optimizations:
 * - Disabling custom smooth scroll animations on touch devices
 * - Increasing overscan buffers for fast touch scrolling
 * - Adding touch-action CSS hints
 *
 * Note: This is a static check on initialization. Touch capability
 * rarely changes during a session, so we don't need dynamic updates.
 */
export function useTouchDevice(): boolean {
  const [isTouchDevice] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    // Check for touch capability
    return (
      'ontouchstart' in window
      || navigator.maxTouchPoints > 0
    );
  });

  return isTouchDevice;
}
