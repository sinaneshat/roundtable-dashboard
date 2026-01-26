import { createContext, use } from 'react';

type SwContextValue = {
  updateAvailable: boolean;
  applyUpdate: () => void;
};

const DEFAULT_SW_CONTEXT: SwContextValue = {
  applyUpdate: () => {},
  updateAvailable: false,
};

export const SwContext = createContext<SwContextValue>(DEFAULT_SW_CONTEXT);

export function useServiceWorker() {
  return use(SwContext);
}
