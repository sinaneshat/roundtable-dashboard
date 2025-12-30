import { headers } from 'next/headers';
import type React from 'react';

import { requireAuth } from '@/app/auth/actions';

// Routes that don't require authentication (public SSG pages)
const PUBLIC_ROUTES = ['/chat/pricing'];

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get current path from referer or next-url header
  const headersList = await headers();
  const referer = headersList.get('referer') || '';
  const nextUrl = headersList.get('next-url') || '';

  // Parse pathname from available headers
  let pathname = '';
  try {
    if (nextUrl) {
      pathname = new URL(nextUrl, 'http://localhost').pathname;
    } else if (referer) {
      pathname = new URL(referer).pathname;
    }
  } catch {
    // Ignore URL parsing errors
  }

  // Skip auth for public routes (SSG pages like pricing)
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname.startsWith(route));

  // Only require auth when:
  // 1. We can determine the pathname (runtime, not SSG build)
  // 2. AND it's not a public route
  // During SSG build, pathname is empty - skip auth to allow static generation
  if (pathname && !isPublicRoute) {
    await requireAuth();
  }

  return children;
}
