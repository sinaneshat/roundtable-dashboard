'use client';

import { usePathname } from 'next/navigation';

import { MinimalHeader, NavigationHeader } from './chat-header';

/**
 * ChatHeaderSwitch - Conditionally renders header based on route
 *
 * - `/chat` (homepage): Shows only MinimalHeader (sidebar toggle only)
 * - All other routes: Shows full NavigationHeader with breadcrumbs
 */
export function ChatHeaderSwitch() {
  const pathname = usePathname();

  // Use minimal header (sidebar toggle only) for the chat homepage
  if (pathname === '/chat') {
    return <MinimalHeader />;
  }

  // Use full navigation header with breadcrumbs for all other routes
  return <NavigationHeader />;
}
