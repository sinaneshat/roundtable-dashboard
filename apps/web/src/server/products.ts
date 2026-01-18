import { createServerFn } from '@tanstack/react-start';

import { getProductsService } from '@/services/api';

/**
 * Fetch products for SSR.
 * Public endpoint - no authentication required.
 * Returns FULL API response to match client queryFn (prevents hydration refetch).
 */
export const getProducts = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      return await getProductsService();
    } catch {
      return { success: false, data: null };
    }
  },
);
