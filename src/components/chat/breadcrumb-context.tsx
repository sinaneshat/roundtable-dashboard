'use client';

import type { ReactNode } from 'react';
import { createContext, use, useMemo, useState } from 'react';

type BreadcrumbContextType = {
  dynamicBreadcrumb: { title: string; parent?: string; actions?: ReactNode } | null;
  setDynamicBreadcrumb: (breadcrumb: { title: string; parent?: string; actions?: ReactNode } | null) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextType | undefined>(undefined);

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

export function useBreadcrumb() {
  const context = use(BreadcrumbContext);
  if (context === undefined) {
    throw new Error('useBreadcrumb must be used within a BreadcrumbProvider');
  }
  return context;
}
