import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_protected/admin')({
  beforeLoad: async ({ context }) => {
    const { session } = context;

    // Redirect non-admins to chat
    if (session?.user?.role !== 'admin') {
      throw redirect({ to: '/chat' });
    }

    return { session };
  },
  component: AdminLayout,
  // Layout route caching: Prevent unnecessary loader re-runs
  staleTime: Infinity,
});

/**
 * Admin route layout - minimal wrapper for admin pages.
 * Auth check happens in beforeLoad. Breadcrumbs are handled by chat-header.
 */
function AdminLayout() {
  return <Outlet />;
}
