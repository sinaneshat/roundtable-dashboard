import { createServerFn } from '@tanstack/react-start';

import { getPublicThreadService } from '@/services/api';

import { slugSchema } from './schemas';

export const getPublicThread = createServerFn({ method: 'GET' })
  .inputValidator((data: string) => slugSchema.parse(data))
  .handler(async ({ data: slug }) => {
    const result = await getPublicThreadService({ param: { slug } });
    return result.success ? result.data : null;
  });
