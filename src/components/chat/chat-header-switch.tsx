'use client';
import { usePathname } from 'next/navigation';

import { MinimalHeader, NavigationHeader } from './chat-header';

/**
 * Determines if scroll-to-bottom button should be shown based on pathname
 *
 * Show scroll button on:
 * - Chat thread pages: /chat/[slug]
 * - Public chat pages: /public/chat/[slug]
 * - Chat overview: / (root)
 *
 * Don't show on:
 * - Other /chat pages (pricing, settings, etc.)
 */
function shouldShowScrollButton(pathname: string | null): boolean {
  if (!pathname)
    return false;

  // Root page (chat overview)
  if (pathname === '/')
    return true;

  // Chat thread pages (but not /chat itself or /chat/pricing etc.)
  if (pathname.startsWith('/chat/') && pathname !== '/chat' && !pathname.startsWith('/chat/pricing') && !pathname.startsWith('/chat/settings')) {
    return true;
  }

  // Public chat pages
  if (pathname.startsWith('/public/chat/')) {
    return true;
  }

  return false;
}

export function ChatHeaderSwitch() {
  const pathname = usePathname();

  if (pathname === '/chat') {
    return <MinimalHeader />;
  }

  const showScrollButton = shouldShowScrollButton(pathname);

  return <NavigationHeader showScrollButton={showScrollButton} />;
}
