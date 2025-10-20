'use client';

import { useEffect, useState } from 'react';

export function useIsMobile(breakpoint: number = 768) {
  // Lazy initialization to avoid setState in useEffect on mount
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined')
      return false;
    return window.innerWidth < breakpoint;
  });

  useEffect(() => {
    // Check if window is defined (client-side)
    if (typeof window === 'undefined')
      return;

    // Resize handler
    const checkMobile = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    // Add resize listener (no need to check on mount, already done in lazy init)
    window.addEventListener('resize', checkMobile);

    // Cleanup
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, [breakpoint]);

  return isMobile;
}
