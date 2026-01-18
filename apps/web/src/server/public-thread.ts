import { createServerFn } from '@tanstack/react-start';

import { getPublicThreadService } from '@/services/api';

/**
 * Fetch public thread data for SSR.
 * Public endpoint - no authentication required.
 */
export const getPublicThread = createServerFn({ method: 'GET' })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    try {
      const result = await getPublicThreadService({ param: { slug } });
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  });
