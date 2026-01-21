import { createServerFn } from '@tanstack/react-start';

import type { ListModelsResponse } from '@/services/api';
import { listModelsService } from '@/services/api';

import type { ServerFnErrorResponse } from './schemas';

type GetModelsResult = ListModelsResponse | ServerFnErrorResponse;

export const getModels = createServerFn({ method: 'GET' }).handler(
  async ({ context }): Promise<GetModelsResult> => {
    return await listModelsService({ cookieHeader: context.cookieHeader });
  },
);
