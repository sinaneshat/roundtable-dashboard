import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_protected/chat')({
  // ✅ LAYOUT ROUTE CACHING: Prevent unnecessary loader re-runs
  // This is a pass-through layout, so staleTime prevents any overhead
  staleTime: Infinity,
  component: ChatLayout,
});

/**
 * Chat route layout - just renders children.
 * ChatStoreProvider is already provided by _protected.tsx parent layout.
 */
function ChatLayout() {
  return <Outlet />;
}
