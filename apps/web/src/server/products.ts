import { createServerFn } from '@tanstack/react-start';

import { getProductsService } from '@/services/api';
import type { ListProductsResponse } from '@/services/api/billing/products';

import type { ServerFnErrorResponse } from './schemas';

type GetProductsResult = ListProductsResponse | ServerFnErrorResponse;

export const getProducts = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetProductsResult> => {
    return await getProductsService();
  },
);
