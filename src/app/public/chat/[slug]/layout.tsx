import type React from 'react';

/**
 * Public Chat Layout
 * Minimal layout for public chat threads (no authentication required)
 */
export default async function PublicChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {children}
    </div>
  );
}
