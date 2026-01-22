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
  // ✅ LAYOUT ROUTE CACHING: Prevent unnecessary loader re-runs
  staleTime: Infinity,
  component: AdminLayout,
});

/**
 * Admin route layout - just renders children.
 * Requires admin role check in beforeLoad.
 */
function AdminLayout() {
  return <Outlet />;
}
