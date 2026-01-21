import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    // Redirect to chat page
    throw redirect({ to: '/chat' });
  },
});
