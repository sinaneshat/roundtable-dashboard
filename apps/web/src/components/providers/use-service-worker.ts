import { createContext, use } from 'react';

type SwContextValue = {
  updateAvailable: boolean;
  applyUpdate: () => void;
};

const DEFAULT_SW_CONTEXT: SwContextValue = {
  updateAvailable: false,
  applyUpdate: () => {},
};

export const SwContext = createContext<SwContextValue>(DEFAULT_SW_CONTEXT);

export function useServiceWorker() {
  return use(SwContext);
}
