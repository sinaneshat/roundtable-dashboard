import { createFileRoute } from '@tanstack/react-router';

import { ProjectDetailScreen } from '@/containers/screens/projects/ProjectDetailScreen';
import { getAppBaseUrl } from '@/lib/config/base-urls';
import {
  projectAttachmentsQueryOptions,
  projectMemoriesQueryOptions,
  projectQueryOptions,
  projectThreadsQueryOptions,
} from '@/lib/data/query-options';
import type { GetProjectResponse } from '@/services/api';

export const Route = createFileRoute('/_protected/chat/projects/$projectId/')({
  staleTime: 0,

  loader: async ({ params, context }) => {
    const { queryClient } = context;
    const isServer = typeof window === 'undefined';

    if (!params.projectId) {
      return { project: null, projectName: null };
    }

    const projectId = params.projectId;
    const options = projectQueryOptions(projectId);

    let initialAttachments;
    let initialMemories;
    let initialThreads;

    try {
      // Always prefetch project data
      await queryClient.ensureQueryData(options);

      // SSR: Prefetch all tab data in parallel for hydration
      if (isServer) {
        [initialAttachments, initialMemories, initialThreads] = await Promise.all([
          queryClient.ensureInfiniteQueryData(projectAttachmentsQueryOptions(projectId)),
          queryClient.ensureInfiniteQueryData(projectMemoriesQueryOptions(projectId)),
          queryClient.ensureInfiniteQueryData(projectThreadsQueryOptions(projectId)),
        ]);
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
      initialAttachments,
      initialMemories,
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
  const loaderData = Route.useLoaderData();

  return (
    <ProjectDetailScreen
      projectId={projectId}
      initialProject={loaderData?.project ?? null}
      initialAttachments={loaderData?.initialAttachments}
      initialMemories={loaderData?.initialMemories}
      initialThreads={loaderData?.initialThreads}
    />
  );
}
