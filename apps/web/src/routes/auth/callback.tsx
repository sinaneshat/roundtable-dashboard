import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';

import { AuthCallbackSkeleton } from '@/components/loading';

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallback,
  pendingComponent: AuthCallbackSkeleton,
});

function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: '/chat' });
  }, [navigate]);

  return <AuthCallbackSkeleton />;
}
