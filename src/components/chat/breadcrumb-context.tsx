'use client';

import type { ReactNode } from 'react';
import { createContext, useMemo, useState } from 'react';

export type BreadcrumbContextType = {
  dynamicBreadcrumb: { title: string; parent?: string; actions?: ReactNode } | null;
  setDynamicBreadcrumb: (breadcrumb: { title: string; parent?: string; actions?: ReactNode } | null) => void;
};

export const BreadcrumbContext = createContext<BreadcrumbContextType | undefined>(undefined);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [dynamicBreadcrumb, setDynamicBreadcrumb] = useState<{ title: string; parent?: string; actions?: ReactNode } | null>(null);

  const contextValue = useMemo(() => ({
    dynamicBreadcrumb,
    setDynamicBreadcrumb,
  }), [dynamicBreadcrumb]);

  return (
    <BreadcrumbContext value={contextValue}>
      {children}
    </BreadcrumbContext>
  );
}
