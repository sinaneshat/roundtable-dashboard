import { createServerFn } from '@tanstack/react-start';
import { zodValidator } from '@tanstack/zod-adapter';

import { getPublicThreadService } from '@/services/api';

import { slugSchema } from './schemas';

export const getPublicThread = createServerFn({ method: 'GET' })
  .inputValidator(zodValidator(slugSchema))
  .handler(async ({ data: slug }) => {
    const result = await getPublicThreadService({ param: { slug } });
    return result.success ? result.data : null;
  });
