import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    // Check session from root context (SSR or client)
    // Direct redirect avoids unnecessary hop: / → /chat → /auth/sign-in
    if (context.session) {
      throw redirect({ to: '/chat' });
    }
    throw redirect({ to: '/auth/sign-in' });
  },
});
