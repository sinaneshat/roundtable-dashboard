import type React from 'react';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth is handled by ChatLayout which wraps all /chat/* routes
  return children;
}
