import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/auth/callback')({
  beforeLoad: async () => {
    throw redirect({ to: '/chat' });
  },
  component: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Redirecting...</div>
    </div>
  ),
});
