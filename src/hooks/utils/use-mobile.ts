'use client';

import { useMediaQuery } from './use-media-query';

export type UseIsMobileReturn = boolean;

export function useIsMobile(breakpoint = 768): UseIsMobileReturn {
  return useMediaQuery(`(max-width: ${breakpoint - 1}px)`);
}
