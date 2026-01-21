/**
 * Turnstile Type Declarations
 */

type TurnstileRenderOptions = {
  'sitekey': string;
  'callback'?: (token: string) => void;
  'error-callback'?: (errorCode: string) => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
  'theme'?: 'light' | 'dark' | 'auto';
  'size'?: 'normal' | 'compact' | 'flexible' | 'invisible';
  'appearance'?: 'always' | 'execute' | 'interaction-only';
  'execution'?: 'render' | 'execute';
  'action'?: string;
  'cData'?: string;
  'refresh-expired'?: 'auto' | 'manual' | 'never';
  'retry'?: 'auto' | 'never';
  'retry-interval'?: number;
};

type TurnstileInstance = {
  ready: (callback: () => void) => void;
  render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
  getResponse: (widgetId: string) => string | undefined;
  isExpired: (widgetId: string) => boolean;
  execute: (container: string | HTMLElement, options?: TurnstileRenderOptions) => void;
};

declare global {
  // eslint-disable-next-line ts/consistent-type-definitions
  interface Window {
    turnstile?: TurnstileInstance;
    onTurnstileLoad?: () => void;
  }
}

export type { TurnstileInstance, TurnstileRenderOptions };
