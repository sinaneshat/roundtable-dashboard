import { PageLoadingFallback } from '@/components/loading';

/**
 * Root Page Loading State
 *
 * Shows minimal loading UI while auth redirect check runs.
 * HomeScreen component performs redirect based on session.
 */
export default function RootLoading() {
  return <PageLoadingFallback className="min-h-dvh" />;
}
