import { createServerFn } from '@tanstack/react-start';
import { zodValidator } from '@tanstack/zod-adapter';

import type {
  GetProjectResponse,
  ListProjectAttachmentsResponse,
  ListProjectMemoriesResponse,
} from '@/services/api';
import {
  getProjectService,
  listProjectAttachmentsService,
  listProjectMemoriesService,
} from '@/services/api';

import type { ServerFnErrorResponse } from './schemas';
import { idSchema } from './schemas';

type GetProjectResult = GetProjectResponse | ServerFnErrorResponse;
type ListProjectAttachmentsResult = ListProjectAttachmentsResponse | ServerFnErrorResponse;
type ListProjectMemoriesResult = ListProjectMemoriesResponse | ServerFnErrorResponse;

export const getProjectById = createServerFn({ method: 'GET' })
  .inputValidator(zodValidator(idSchema))
  .handler(async ({ context, data }): Promise<GetProjectResult> => {
    return await getProjectService({ param: { id: data } }, { cookieHeader: context.cookieHeader });
  });

export const getProjectAttachments = createServerFn({ method: 'GET' })
  .inputValidator(zodValidator(idSchema))
  .handler(async ({ context, data }): Promise<ListProjectAttachmentsResult> => {
    return await listProjectAttachmentsService(
      { param: { id: data }, query: { limit: 50 } },
      { cookieHeader: context.cookieHeader },
    );
  });

export const getProjectMemories = createServerFn({ method: 'GET' })
  .inputValidator(zodValidator(idSchema))
  .handler(async ({ context, data }): Promise<ListProjectMemoriesResult> => {
    return await listProjectMemoriesService(
      { param: { id: data }, query: { limit: 50 } },
      { cookieHeader: context.cookieHeader },
    );
  });
