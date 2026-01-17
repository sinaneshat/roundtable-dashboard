import { AuthFormSkeleton } from '@/components/ui/skeleton';
import { dynamic } from '@/lib/compat';

// Heavy dependencies: react-hook-form, zod, motion/react - 3 major libraries
// Client-only, deferred loading - auth form is interactive and user-initiated
// Only loads when user lands on auth pages, not in initial bundle
const AuthForm = dynamic(
  () => import('./auth-form').then(mod => ({ default: mod.AuthForm })),
  {
    ssr: false,
    loading: () => <AuthFormSkeleton />,
  },
);

export function AuthFormLoader() {
  return <AuthForm />;
}
