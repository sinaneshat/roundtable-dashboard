import { NotFoundScreen } from '@/containers/screens/general';

// Force dynamic rendering to prevent static generation issues
export const dynamic = 'force-dynamic';

export default function NotFound() {
  return <NotFoundScreen />;
}
