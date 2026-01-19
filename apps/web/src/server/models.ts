import { createServerFn } from '@tanstack/react-start';

import type { ListModelsResponse } from '@/services/api';
import { listModelsService } from '@/services/api';
import { cookieMiddleware } from '@/start';

type ServerFnErrorResponse = { success: false; data: null };
type GetModelsResult = ListModelsResponse | ServerFnErrorResponse;

export const getModels = createServerFn({ method: 'GET' })
  .middleware([cookieMiddleware])
  .handler(async ({ context }): Promise<GetModelsResult> => {
    return await listModelsService({ cookieHeader: context.cookieHeader });
  });
