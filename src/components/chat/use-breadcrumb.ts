'use client';

import { use } from 'react';

import { BreadcrumbContext } from './breadcrumb-context';

export function useBreadcrumb() {
  const context = use(BreadcrumbContext);
  if (context === undefined) {
    throw new Error('useBreadcrumb must be used within a BreadcrumbProvider');
  }
  return context;
}
