/**
 * Turnstile Provider - Managed/Invisible Mode
 *
 * Provides page-wide Turnstile protection that:
 * - Runs automatically in the background
 * - Only shows challenges when Cloudflare detects suspicious behavior
 * - Refreshes tokens automatically before expiry
 * - Exposes token via context for API calls
 */

import type { ReactNode } from 'react';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { TurnstileRenderOptions } from './turnstile.d';

export type TurnstileContextValue = {
  token: string | null;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  refreshToken: () => void;
  getToken: () => string | null;
};

const TurnstileContext = createContext<TurnstileContextValue | null>(null);

type TurnstileProviderProps = {
  children: ReactNode;
  siteKey?: string;
};

const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const TOKEN_REFRESH_INTERVAL = 4 * 60 * 1000; // 4 minutes (tokens expire at 5 min)

export function TurnstileProvider({ children, siteKey }: TurnstileProviderProps) {
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const widgetIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get site key from env or prop
  const resolvedSiteKey = siteKey || import.meta.env.VITE_TURNSTILE_SITE_KEY;

  const handleSuccess = useCallback((newToken: string) => {
    setToken(newToken);
    setError(null);
    setIsLoading(false);
  }, []);

  const handleError = useCallback((errorCode: string) => {
    console.error('[Turnstile] Error:', errorCode);
    setError(errorCode);
    setIsLoading(false);
  }, []);

  const handleExpired = useCallback(() => {
    setToken(null);
    // Auto-refresh on expiry
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, []);

  const refreshToken = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      setIsLoading(true);
      window.turnstile.reset(widgetIdRef.current);
    }
  }, []);

  const getToken = useCallback(() => {
    return token;
  }, [token]);

  // Initialize Turnstile
  useEffect(() => {
    // Skip on server
    if (typeof window === 'undefined')
      return;

    // Skip if no site key - Turnstile is optional
    if (!resolvedSiteKey) {
      return;
    }

    // Create hidden container for the widget
    if (!containerRef.current) {
      const container = document.createElement('div');
      container.id = 'turnstile-container';
      container.style.cssText = 'position: fixed; bottom: 0; right: 0; z-index: 9999;';
      document.body.appendChild(container);
      containerRef.current = container;
    }

    const initWidget = () => {
      if (!window.turnstile || !containerRef.current)
        return;

      window.turnstile.ready(() => {
        if (widgetIdRef.current) {
          window.turnstile?.remove(widgetIdRef.current);
        }

        const container = containerRef.current;
        if (!container)
          return;

        const options: TurnstileRenderOptions = {
          'sitekey': resolvedSiteKey,
          'callback': handleSuccess,
          'error-callback': handleError,
          'expired-callback': handleExpired,
          'timeout-callback': handleExpired,
          'theme': 'dark',
          'appearance': 'interaction-only', // Only show when needed
          'execution': 'render', // Run automatically
          'refresh-expired': 'auto', // Auto-refresh expired tokens
          'retry': 'auto',
          'retry-interval': 5000,
        };

        const widgetId = window.turnstile?.render(container, options);

        if (widgetId) {
          widgetIdRef.current = widgetId;
          setIsReady(true);
        }
      });
    };

    // Check if script already loaded
    if (window.turnstile) {
      initWidget();
    } else {
      // Load script
      const existingScript = document.querySelector(`script[src*="turnstile"]`);
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = `${TURNSTILE_SCRIPT_URL}?render=explicit&onload=onTurnstileLoad`;
        script.async = true;
        script.defer = true;

        window.onTurnstileLoad = initWidget;

        script.onerror = () => {
          setError('Failed to load Turnstile script');
          setIsLoading(false);
        };

        document.head.appendChild(script);
      } else {
        // Script exists, wait for it to load
        window.onTurnstileLoad = initWidget;
      }
    }

    // Set up periodic token refresh (every 4 minutes)
    refreshIntervalRef.current = setInterval(() => {
      if (token && widgetIdRef.current && window.turnstile) {
        const isExpired = window.turnstile.isExpired(widgetIdRef.current);
        if (isExpired) {
          refreshToken();
        }
      }
    }, TOKEN_REFRESH_INTERVAL);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      if (containerRef.current && containerRef.current.parentNode) {
        containerRef.current.parentNode.removeChild(containerRef.current);
      }
    };
  }, [resolvedSiteKey, handleSuccess, handleError, handleExpired, refreshToken, token]);

  const value: TurnstileContextValue = {
    token,
    isReady,
    isLoading,
    error,
    refreshToken,
    getToken,
  };

  return (
    <TurnstileContext value={value}>
      {children}
    </TurnstileContext>
  );
}

export function useTurnstile(): TurnstileContextValue {
  const context = use(TurnstileContext);
  if (!context) {
    // Return a no-op context when not inside provider (e.g., SSR)
    return {
      token: null,
      isReady: false,
      isLoading: false,
      error: null,
      refreshToken: () => {},
      getToken: () => null,
    };
  }
  return context;
}
