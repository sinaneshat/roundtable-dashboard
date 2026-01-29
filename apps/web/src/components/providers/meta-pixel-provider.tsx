import { WebAppEnvs } from '@roundtable/shared/enums';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

import { getWebappEnv } from '@/lib/config/base-urls';

import { MetaPixelPageViewTracker } from './meta-pixel-pageview-tracker';

type FacebookPixelFn = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  push?: (...args: unknown[]) => void;
  loaded?: boolean;
  version?: string;
  queue?: unknown[][];
};

declare global {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface Window {
    fbq?: FacebookPixelFn;
    _fbq?: FacebookPixelFn;
  }
}

const META_PIXEL_ID = '2006071313583543';

type MetaPixelProviderProps = {
  children: ReactNode;
};

/**
 * Meta Pixel Provider - Deferred loading for TanStack Start
 *
 * Meta Pixel is loaded after browser idle via IdleLazyProvider for optimization.
 * Environment detection skips local development.
 */
export default function MetaPixelProvider({ children }: MetaPixelProviderProps) {
  const initStarted = useRef(false);

  const environment = getWebappEnv();
  const isLocal = environment === WebAppEnvs.LOCAL;

  useEffect(() => {
    // Skip SSR
    if (typeof window === 'undefined') {
      return;
    }

    // Skip local env
    if (isLocal) {
      return;
    }

    // Prevent double init
    if (initStarted.current) {
      return;
    }
    initStarted.current = true;

    // Check if already loaded (e.g., HMR)
    if (window.fbq) {
      return;
    }

    // Initialize fbq function
    const fbq: FacebookPixelFn = function (...args: unknown[]) {
      if (fbq.callMethod) {
        fbq.callMethod(...args);
      } else {
        fbq.queue?.push(args);
      }
    };

    if (!window._fbq) {
      window._fbq = fbq;
    }

    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];

    window.fbq = fbq;

    // Load fbevents.js script
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);

    // Initialize pixel and fire initial PageView
    fbq('init', META_PIXEL_ID);
    fbq('track', 'PageView');
  }, [isLocal]);

  // Skip SSR
  if (typeof window === 'undefined') {
    return <>{children}</>;
  }

  // Skip local env
  if (isLocal) {
    return <>{children}</>;
  }

  return (
    <>
      <MetaPixelPageViewTracker />
      {children}
    </>
  );
}
