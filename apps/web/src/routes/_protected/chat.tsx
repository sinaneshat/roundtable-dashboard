import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_protected/chat')({
  component: ChatLayout,
});

/**
 * Chat route layout - just renders children.
 * ChatStoreProvider is already provided by _protected.tsx parent layout.
 */
function ChatLayout() {
  return <Outlet />;
}
