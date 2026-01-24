import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { ProjectDetailScreen } from '@/containers/screens/projects/ProjectDetailScreen';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import {
  projectQueryOptions,
  projectThreadsQueryOptions,
} from '@/lib/data/query-options';
import type { GetProjectResponse } from '@/services/api';

const searchSchema = z.object({
  settings: z.boolean().optional(),
});

export const Route = createFileRoute('/_protected/chat/projects/$projectId/')({
  staleTime: 0,
  validateSearch: searchSchema,

  loader: async ({ params, context }) => {
    const { queryClient } = context;
    const isServer = typeof window === 'undefined';

    if (!params.projectId) {
      return { project: null, projectName: null };
    }

    const projectId = params.projectId;
    const options = projectQueryOptions(projectId);

    let initialThreads;

    try {
      // Always prefetch project data
      await queryClient.ensureQueryData(options);

      // SSR: Prefetch threads for hydration
      if (isServer) {
        initialThreads = await queryClient.ensureInfiniteQueryData(projectThreadsQueryOptions(projectId));
      }
    } catch (error) {
      console.error('[ProjectDetail] Loader error:', error);
      return { project: null, projectName: null };
    }

    const cachedData = queryClient.getQueryData<GetProjectResponse>(options.queryKey);
    const project = cachedData?.success ? cachedData.data : null;

    return {
      project,
      projectName: project?.name ?? null,
      initialThreads,
    };
  },

  head: ({ loaderData }) => {
    const siteUrl = getAppBaseUrl();
    const displayTitle = loaderData?.projectName
      ? `${loaderData.projectName} - Roundtable`
      : 'Project - Roundtable';

    return {
      meta: [
        { title: displayTitle },
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      links: [
        { rel: 'canonical', href: `${siteUrl}/chat/projects` },
      ],
    };
  },

  component: ProjectDetailRoute,
});

function ProjectDetailRoute() {
  const { projectId } = Route.useParams();
  const { settings } = Route.useSearch();
  const loaderData = Route.useLoaderData();

  return (
    <ProjectDetailScreen
      projectId={projectId}
      initialProject={loaderData?.project ?? null}
      initialThreads={loaderData?.initialThreads}
      openSettings={settings}
    />
  );
}
