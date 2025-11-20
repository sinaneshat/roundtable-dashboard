import type React from 'react';

/**
 * Minimal layout for offline page
 * Does not use translations or complex providers to ensure reliable static generation
 */
export default function OfflineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
