import { getPublicThreadService } from '@/services/api';

/**
 * Fetch public thread data for SSR.
 * Public endpoint - no authentication required.
 * Called directly during SSR loader execution.
 */
export async function getPublicThread(slug: string) {
  try {
    const result = await getPublicThreadService({ param: { slug } });
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
