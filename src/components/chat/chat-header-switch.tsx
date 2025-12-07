'use client';
import { usePathname } from 'next/navigation';

import { MinimalHeader, NavigationHeader } from './chat-header';

export function ChatHeaderSwitch() {
  const pathname = usePathname();

  if (pathname === '/chat') {
    return <MinimalHeader />;
  }

  return <NavigationHeader />;
}
